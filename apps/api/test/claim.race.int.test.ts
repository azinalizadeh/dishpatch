import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { eventLog, events, slots } from '../src/db/schema.ts';
import { clock, createBoard, joinGuest, slotIds } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { ORIGIN } from './helpers/requests.ts';

/** F4.4: real concurrent requests against real Postgres; the DB alone decides the winners. */
describe('claim race', () => {
  const db = useTestDb();

  async function setup() {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    const ids = (await slotIds(db, board.eventId)).map((s) => s.id);
    const path = (slotId: string) => `/api/events/${board.eventId}/slots/${slotId}/claim`;
    const claim = (cookie: string, slotId: string, dishName = 'Dish') =>
      request(app)
        .post(path(slotId))
        .set('Origin', ORIGIN)
        .set('Cookie', `dp_sess=${cookie}`)
        .send({ dishName, dishTags: [] });
    const release = (cookie: string, slotId: string) =>
      request(app).delete(path(slotId)).set('Origin', ORIGIN).set('Cookie', `dp_sess=${cookie}`);
    return { board, ids, claim, release };
  }

  it('50 concurrent claims on one slot yield exactly one 200', async () => {
    const { board, ids, claim } = await setup();
    const guests = [];
    for (let i = 0; i < 50; i++) guests.push(await joinGuest(db, board, `Guest ${i}`));
    const target = ids[0] as string;

    const results = await Promise.all(guests.map((g, i) => claim(g.cookie, target, `Dish ${i}`)));

    const winners = results.filter((r) => r.status === 200);
    const losers = results.filter((r) => r.status === 409);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(49);
    const winnerName = winners[0]?.body.slot.claimedBy.displayName;
    for (const loser of losers) {
      expect(loser.body.error).toMatchObject({ code: 'SLOT_TAKEN', claimedBy: winnerName });
    }
    const [row] = await db.orm.select().from(slots).where(eq(slots.id, target));
    expect(row?.dishName).toBe(winners[0]?.body.slot.dishName);
  });

  it('claim limit holds under 10 concurrent claims by one participant', async () => {
    const { board, ids, claim } = await setup();
    const sam = await joinGuest(db, board, 'Sam');

    const results = await Promise.all(ids.slice(0, 10).map((id) => claim(sam.cookie, id)));

    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    const rejected = results.filter((r) => r.status !== 200);
    expect(rejected).toHaveLength(7);
    expect(rejected.every((r) => r.body.error.code === 'CLAIM_LIMIT')).toBe(true);
    const mine = await db.orm.select().from(slots).where(eq(slots.claimedBy, sam.participantId));
    expect(mine).toHaveLength(3);
  });

  it('seq values are gap-free and unique after 100 mixed concurrent operations', async () => {
    const { board, ids, claim, release } = await setup();
    // 5 guests × 20 operations stays under the 30/min per-session limit.
    const guests: { cookie: string }[] = [];
    for (let i = 0; i < 5; i++) guests.push(await joinGuest(db, board, `Guest ${i}`));

    const ops = Array.from({ length: 100 }, (_, i) => {
      const guest = guests[i % guests.length] as (typeof guests)[number];
      const slotId = ids[i % ids.length] as string;
      return i % 3 === 2 ? release(guest.cookie, slotId) : claim(guest.cookie, slotId);
    });
    const results = await Promise.all(ops);

    expect(results.every((r) => [200, 403, 409].includes(r.status))).toBe(true);
    const rows = await db.orm
      .select({ seq: eventLog.seq })
      .from(eventLog)
      .where(eq(eventLog.eventId, board.eventId))
      .orderBy(asc(eventLog.seq));
    const seqs = rows.map((r) => r.seq);
    expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1));
    const [event] = await db.orm
      .select({ seq: events.seq })
      .from(events)
      .where(eq(events.id, board.eventId));
    expect(event?.seq).toBe(seqs.length);
    // Every successful operation logged exactly one row (plus the 5 joins).
    expect(seqs.length).toBe(5 + results.filter((r) => r.status === 200).length);
  });
});
