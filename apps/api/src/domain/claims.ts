import { type ClaimInput, type ClaimResponse, type Dietary, LIMITS } from '@dishpatch/shared';
import { and, count, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { events, participants, slots } from '../db/schema.ts';
import type { Actor } from '../middleware/session.ts';
import type { EventBus } from '../realtime/event-bus.ts';
import { recordAndPublish } from '../realtime/event-log.ts';
import { boardLocked, claimLimit, notClaimed, notFound, notOwner, slotTaken } from './errors.ts';

const SlotId = z.uuid();

type Tx = Parameters<Parameters<Db['orm']['transaction']>[0]>[0];

/** Locks the actor's event row (always the first lock, so claims and releases can't deadlock). */
async function lockEvent(tx: Tx, actor: Actor) {
  const [event] = await tx
    .select({ locked: events.locked })
    .from(events)
    .where(eq(events.id, actor.eventId))
    .for('update');
  if (!event) throw notFound();
  if (event.locked) throw boardLocked();
}

/**
 * Claims an open slot (04-architecture.md › Signature challenge). The event row lock serialises
 * writes per board, so the claim limit and `seq + 1` hold under concurrency; the conditional
 * `UPDATE … WHERE claimed_by IS NULL` is what guarantees exactly one winner per slot.
 */
export async function claimSlot(
  db: Db,
  clock: Clock,
  bus: EventBus,
  actor: Actor,
  slotId: string,
  input: ClaimInput,
): Promise<ClaimResponse> {
  if (!SlotId.safeParse(slotId).success) throw notFound();

  return recordAndPublish(db, bus, clock, async (tx, record) => {
    await lockEvent(tx, actor);

    const [{ mine = 0 } = {}] = await tx
      .select({ mine: count() })
      .from(slots)
      .where(and(eq(slots.eventId, actor.eventId), eq(slots.claimedBy, actor.participantId)));
    if (mine >= LIMITS.claimsPerParticipantMax) throw claimLimit(LIMITS.claimsPerParticipantMax);

    const [claimed] = await tx
      .update(slots)
      .set({
        claimedBy: actor.participantId,
        dishName: input.dishName,
        dishTags: input.dishTags,
        claimedAt: clock.now(),
      })
      .where(and(eq(slots.id, slotId), eq(slots.eventId, actor.eventId), isNull(slots.claimedBy)))
      .returning({ id: slots.id, category: slots.category, position: slots.position });

    if (!claimed) {
      const [winner] = await tx
        .select({ displayName: participants.displayName })
        .from(slots)
        .leftJoin(participants, eq(participants.id, slots.claimedBy))
        .where(and(eq(slots.id, slotId), eq(slots.eventId, actor.eventId)));
      if (!winner) throw notFound();
      // A claimant deleted mid-race leaves no name; "Someone" still explains the 409.
      throw slotTaken(winner.displayName ?? 'Someone');
    }

    const [me] = await tx
      .select({ displayName: participants.displayName })
      .from(participants)
      .where(eq(participants.id, actor.participantId));
    if (!me) throw notFound();

    const slot = {
      ...claimed,
      claimedBy: { id: actor.participantId, displayName: me.displayName },
      dishName: input.dishName,
      dishTags: input.dishTags,
    };
    const { seq } = await record(actor.eventId, { type: 'slot.claimed', slot });
    return { slot, seq };
  });
}

/** Reopens a claimed slot. Only its claimant or the host may; the event log records which. */
export async function releaseSlot(
  db: Db,
  clock: Clock,
  bus: EventBus,
  actor: Actor,
  slotId: string,
): Promise<ClaimResponse> {
  if (!SlotId.safeParse(slotId).success) throw notFound();

  return recordAndPublish(db, bus, clock, async (tx, record) => {
    await lockEvent(tx, actor);

    const [current] = await tx
      .select({ claimedBy: slots.claimedBy })
      .from(slots)
      .where(and(eq(slots.id, slotId), eq(slots.eventId, actor.eventId)))
      .for('update');
    if (!current) throw notFound();
    if (current.claimedBy === null) throw notClaimed();
    if (current.claimedBy !== actor.participantId && actor.role !== 'host') throw notOwner();

    const [released] = await tx
      .update(slots)
      .set({ claimedBy: null, dishName: null, dishTags: [], claimedAt: null })
      .where(eq(slots.id, slotId))
      .returning({ id: slots.id, category: slots.category, position: slots.position });
    if (!released) throw notFound();

    const slot = { ...released, claimedBy: null, dishName: null, dishTags: [] as Dietary[] };
    const { seq } = await record(actor.eventId, {
      type: 'slot.released',
      slotId,
      actorRole: actor.role,
    });
    return { slot, seq };
  });
}
