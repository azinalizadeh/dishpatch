import { CATEGORIES, type CreateEventInput } from '@dishpatch/shared';
import { asc } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { friendsgivingPayload } from '../../../packages/shared/test/fixtures/create-event.ts';
import { eventLog, events, participants, sessions, slots } from '../src/db/schema.ts';
import { createEvent } from '../src/domain/events.ts';
import { hashToken } from '../src/domain/tokens.ts';
import { useTestDb } from './helpers/int-app.ts';
import { fixedClock } from './helpers/test-app.ts';

const clock = fixedClock('2026-10-20T12:00:00Z');
const input = (): CreateEventInput => ({
  ...friendsgivingPayload(clock.now()),
  startsAt: '2026-11-21T17:00:00.000Z',
});

describe('createEvent', () => {
  const db = useTestDb();

  it('createEvent stores hashes, never raw tokens', async () => {
    const created = await createEvent(db, clock, input());
    const raw = [created.hostToken, created.inviteToken, created.sessionToken];
    expect(new Set(raw).size).toBe(3);

    const tables = await Promise.all(
      [events, participants, sessions, slots, eventLog].map((t) => db.orm.select().from(t)),
    );
    const dump = JSON.stringify(tables, (_key, value) =>
      // Buffers serialise as {type, data}; compare their base64url form too.
      value?.type === 'Buffer' ? Buffer.from(value.data).toString('base64url') : value,
    );
    for (const token of raw) expect(dump).not.toContain(token);

    const [event] = await db.orm.select().from(events);
    expect(event?.hostTokenHash.equals(hashToken(created.hostToken))).toBe(true);
    expect(event?.inviteTokenHash.equals(hashToken(created.inviteToken))).toBe(true);
    const [session] = await db.orm.select().from(sessions);
    expect(session?.tokenHash.equals(hashToken(created.sessionToken))).toBe(true);
  });

  it('createEvent creates host participant, slots with positions and sets expires_at to starts_at + 14 days', async () => {
    const created = await createEvent(db, clock, { ...input(), hostDietaryNeeds: ['vegan'] });

    const [event] = await db.orm.select().from(events);
    expect(event).toMatchObject({
      id: created.eventId,
      title: "Friendsgiving at Mina's",
      location: "Mina's flat, 3rd floor",
      locked: false,
      seq: 0,
    });
    expect(event?.expiresAt.toISOString()).toBe('2026-12-05T17:00:00.000Z');
    expect(created.expiresAt.toISOString()).toBe('2026-12-05T17:00:00.000Z');

    const people = await db.orm.select().from(participants);
    expect(people).toEqual([
      expect.objectContaining({
        id: created.hostParticipantId,
        eventId: created.eventId,
        displayName: 'Mina',
        role: 'host',
        dietaryNeeds: ['vegan'],
      }),
    ]);

    const [session] = await db.orm.select().from(sessions);
    expect(session?.participantId).toBe(created.hostParticipantId);
    expect(session?.expiresAt.toISOString()).toBe('2026-12-05T17:00:00.000Z');

    const rows = await db.orm
      .select({ category: slots.category, position: slots.position, claimedBy: slots.claimedBy })
      .from(slots)
      .orderBy(asc(slots.category), asc(slots.position));
    expect(rows).toHaveLength(12);
    const positions = Object.fromEntries(
      CATEGORIES.map((c) => [c, rows.filter((r) => r.category === c).map((r) => r.position)]),
    );
    expect(positions).toEqual({
      main: [0, 1, 2],
      side: [0, 1, 2],
      salad: [0, 1],
      dessert: [0, 1],
      drinks: [0, 1],
    });
    expect(rows.every((r) => r.claimedBy === null)).toBe(true);
  });

  it('stores null when the location is omitted', async () => {
    const { location: _omitted, ...withoutLocation } = input();
    await createEvent(db, clock, withoutLocation);
    const [event] = await db.orm.select().from(events);
    expect(event?.location).toBeNull();
  });

  it('rolls back everything if slot insert fails', async () => {
    // 13 mains bypasses the schema; position 12 breaks the DB CHECK on the slot insert.
    const bad = { ...input(), slots: [{ category: 'main' as const, count: 13 }] };
    await expect(createEvent(db, clock, bad)).rejects.toThrow();

    for (const table of [events, participants, sessions, slots]) {
      expect(await db.orm.select().from(table)).toEqual([]);
    }
  });
});
