import {
  type Category,
  IdParam,
  LIMITS,
  type SeqResponse,
  type SlotView,
  type UpdateEventResponse,
} from '@dishpatch/shared';
import { and, count, eq } from 'drizzle-orm';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { events, slots } from '../db/schema.ts';
import type { Actor } from '../middleware/session.ts';
import type { EventBus } from '../realtime/event-bus.ts';
import { recordAndPublish } from '../realtime/event-log.ts';
import { confirmMismatch, hostOnly, notFound, slotClaimed, slotLimit } from './errors.ts';
import { generateToken, hashToken } from './tokens.ts';

type Tx = Parameters<Parameters<Db['orm']['transaction']>[0]>[0];

/**
 * Every host action starts here (07-security.md › E1). The check lives in the service, not the
 * route or the UI, so no caller can forget it.
 */
export function requireHost(actor: Actor): void {
  if (actor.role !== 'host') throw hostOnly();
}

/** Locks the host's event row for the transaction (the first lock, as in claims). */
async function lockEvent(tx: Tx, eventId: string) {
  const [event] = await tx
    .select({
      id: events.id,
      title: events.title,
      startsAt: events.startsAt,
      location: events.location,
      locked: events.locked,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .for('update');
  if (!event) throw notFound();
  return event;
}

/** API #9. Two host devices toggling at once: the row lock orders them and the last one wins. */
export async function setLocked(
  db: Db,
  clock: Clock,
  bus: EventBus,
  actor: Actor,
  locked: boolean,
): Promise<UpdateEventResponse> {
  requireHost(actor);
  return recordAndPublish(db, bus, clock, async (tx, record) => {
    const event = await lockEvent(tx, actor.eventId);
    await tx.update(events).set({ locked }).where(eq(events.id, event.id));
    const { seq } = await record(event.id, { type: 'event.updated', locked });
    const { startsAt, ...rest } = event;
    return { event: { ...rest, startsAt: startsAt.toISOString(), locked }, seq };
  });
}

/** API #10: one more open slot, in the lowest free position of its category. */
export async function addSlot(
  db: Db,
  clock: Clock,
  bus: EventBus,
  actor: Actor,
  category: Category,
): Promise<{ slot: SlotView; seq: number }> {
  requireHost(actor);
  return recordAndPublish(db, bus, clock, async (tx, record) => {
    await lockEvent(tx, actor.eventId);

    const [{ total = 0 } = {}] = await tx
      .select({ total: count() })
      .from(slots)
      .where(eq(slots.eventId, actor.eventId));
    if (total >= LIMITS.slotsTotalMax)
      throw slotLimit(`A board can have up to ${LIMITS.slotsTotalMax} slots.`);

    const taken = await tx
      .select({ position: slots.position })
      .from(slots)
      .where(and(eq(slots.eventId, actor.eventId), eq(slots.category, category)));
    if (taken.length >= LIMITS.slotsPerCategoryMax)
      throw slotLimit(`Up to ${LIMITS.slotsPerCategoryMax} per category.`);
    const used = new Set(taken.map((t) => t.position));
    let position = 0;
    while (used.has(position)) position++;

    const [row] = await tx
      .insert(slots)
      .values({ eventId: actor.eventId, category, position })
      .returning({ id: slots.id, category: slots.category, position: slots.position });
    if (!row) throw new Error('slot insert returned no row');

    const slot: SlotView = { ...row, claimedBy: null, dishName: null, dishTags: [] };
    const { seq } = await record(actor.eventId, { type: 'slot.added', slot });
    return { slot, seq };
  });
}

/** API #11. Only open slots can go; a claimed one needs its claim removed first. */
export async function removeSlot(
  db: Db,
  clock: Clock,
  bus: EventBus,
  actor: Actor,
  slotId: string,
): Promise<SeqResponse> {
  requireHost(actor);
  if (!IdParam.safeParse(slotId).success) throw notFound();
  return recordAndPublish(db, bus, clock, async (tx, record) => {
    await lockEvent(tx, actor.eventId);
    const [slot] = await tx
      .select({ claimedBy: slots.claimedBy })
      .from(slots)
      .where(and(eq(slots.id, slotId), eq(slots.eventId, actor.eventId)));
    if (!slot) throw notFound();
    if (slot.claimedBy !== null) throw slotClaimed();

    await tx.delete(slots).where(eq(slots.id, slotId));
    return record(actor.eventId, { type: 'slot.removed', slotId });
  });
}

/**
 * API #12. One UPDATE swaps the stored hash, so the old link stops working the moment the new
 * one exists (07-security.md › E2). Sessions don't depend on the invite, so members stay in.
 */
export async function rotateInvite(
  db: Db,
  clock: Clock,
  bus: EventBus,
  actor: Actor,
): Promise<{ inviteToken: string; seq: number }> {
  requireHost(actor);
  const inviteToken = generateToken();
  return recordAndPublish(db, bus, clock, async (tx, record) => {
    await lockEvent(tx, actor.eventId);
    await tx
      .update(events)
      .set({ inviteTokenHash: hashToken(inviteToken) })
      .where(eq(events.id, actor.eventId));
    const { seq } = await record(actor.eventId, { type: 'invite.rotated' });
    return { inviteToken, seq };
  });
}

/**
 * API #13. A hard delete: the event row goes and the foreign keys cascade to participants,
 * sessions, slots and the event log. `event.deleted` is published after commit, so every open
 * stream sends it and closes.
 */
export async function deleteEvent(
  db: Db,
  bus: EventBus,
  actor: Actor,
  confirmTitle: string,
): Promise<void> {
  requireHost(actor);
  await db.orm.transaction(async (tx) => {
    const event = await lockEvent(tx, actor.eventId);
    if (confirmTitle !== event.title) throw confirmMismatch();
    await tx.delete(events).where(eq(events.id, event.id));
  });
  bus.publish(actor.eventId, { type: 'event.deleted' });
}
