import { randomBytes } from 'node:crypto';
import { DIETARY } from '@dishpatch/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { events, participants, slots } from '../src/db/schema.ts';
import { useTestDb } from './helpers/int-app.ts';

describe('database constraints', () => {
  const db = useTestDb();

  async function anEvent() {
    const [event] = await db.orm
      .insert(events)
      .values({
        title: "Friendsgiving at Mina's",
        startsAt: new Date('2026-11-21T17:00:00Z'),
        hostTokenHash: randomBytes(32),
        inviteTokenHash: randomBytes(32),
        expiresAt: new Date('2026-12-05T17:00:00Z'),
      })
      .returning();
    if (!event) throw new Error('no event');
    return event;
  }

  async function aParticipant(
    eventId: string,
    displayName = 'Mina',
    role: 'host' | 'guest' = 'host',
  ) {
    const [participant] = await db.orm
      .insert(participants)
      .values({ eventId, displayName, role })
      .returning();
    if (!participant) throw new Error('no participant');
    return participant;
  }

  /** Postgres error code (SQLSTATE) of a rejected promise. */
  async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
    try {
      await promise;
    } catch (err) {
      const cause = (err as { cause?: { code?: string } }).cause ?? (err as { code?: string });
      return cause.code;
    }
    return undefined;
  }

  it('DB rejects unknown dish tag even if service is bypassed', async () => {
    const event = await anEvent();
    const insert = db.orm
      .insert(slots)
      .values({ eventId: event.id, category: 'main', position: 0, dishTags: ['keto'] });
    expect(await sqlState(insert)).toBe('23514'); // check_violation
  });

  it('DB rejects half-claimed slot (dish without claimant)', async () => {
    const event = await anEvent();
    const insert = db.orm
      .insert(slots)
      .values({ eventId: event.id, category: 'main', position: 0, dishName: 'Ghormeh sabzi' });
    expect(await sqlState(insert)).toBe('23514');
  });

  it('accepts every shared DIETARY value and rejects unknown dietary needs', async () => {
    const event = await anEvent();
    const host = await db.orm
      .insert(participants)
      .values({ eventId: event.id, displayName: 'Mina', role: 'host', dietaryNeeds: [...DIETARY] })
      .returning();
    expect(host[0]?.dietaryNeeds).toEqual([...DIETARY]);

    const bad = db.orm
      .insert(participants)
      .values({ eventId: event.id, displayName: 'Reza', role: 'guest', dietaryNeeds: ['paleo'] });
    expect(await sqlState(bad)).toBe('23514');
  });

  it('allows one host per board and unique names regardless of case', async () => {
    const event = await anEvent();
    await aParticipant(event.id, 'Mina', 'host');
    expect(await sqlState(aParticipant(event.id, 'Someone', 'host'))).toBe('23505');
    expect(await sqlState(aParticipant(event.id, 'MINA', 'guest'))).toBe('23505');
  });

  it('rejects blank titles, positions outside 0–11 and duplicate positions', async () => {
    const blank = db.orm.insert(events).values({
      title: '   ',
      startsAt: new Date(),
      hostTokenHash: randomBytes(32),
      inviteTokenHash: randomBytes(32),
      expiresAt: new Date(),
    });
    expect(await sqlState(blank)).toBe('23514');

    const event = await anEvent();
    const outOfRange = db.orm
      .insert(slots)
      .values({ eventId: event.id, category: 'main', position: 12 });
    expect(await sqlState(outOfRange)).toBe('23514');
    await db.orm.insert(slots).values({ eventId: event.id, category: 'main', position: 0 });
    const duplicate = db.orm
      .insert(slots)
      .values({ eventId: event.id, category: 'main', position: 0 });
    expect(await sqlState(duplicate)).toBe('23505');
  });

  it('deleting an event removes its participants and slots, claimed ones included', async () => {
    const event = await anEvent();
    const guest = await aParticipant(event.id, 'Reza', 'guest');
    await db.orm.insert(slots).values({
      eventId: event.id,
      category: 'main',
      position: 0,
      claimedBy: guest.id,
      dishName: 'Ghormeh sabzi',
      claimedAt: new Date(),
    });

    await db.orm.delete(events).where(eq(events.id, event.id));

    expect(await db.orm.select().from(participants)).toEqual([]);
    expect(await db.orm.select().from(slots)).toEqual([]);
  });
});
