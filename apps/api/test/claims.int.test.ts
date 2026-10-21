import { type BoardEvent, ClaimResponse } from '@dishpatch/shared';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { eventLog, events, slots } from '../src/db/schema.ts';
import { createInProcessEventBus } from '../src/realtime/event-bus.ts';
import { clock, createBoard, joinGuest, slotIds } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { ORIGIN } from './helpers/requests.ts';

const pie = { dishName: 'Mushroom pie', dishTags: ['vegan', 'nut_free'] };

describe('claims', () => {
  const db = useTestDb();

  async function setup() {
    const board = await createBoard(db);
    const bus = createInProcessEventBus();
    const published: BoardEvent[] = [];
    bus.subscribe(board.eventId, (m) => published.push(m));
    const { app } = intApp(db, { clock, bus });
    const [main0, main1, main2, side0] = await slotIds(db, board.eventId);
    const path = (slotId: string | undefined) =>
      `/api/events/${board.eventId}/slots/${slotId}/claim`;
    const claim = (cookie: string, slotId: string | undefined, body: object = pie) =>
      request(app)
        .post(path(slotId))
        .set('Origin', ORIGIN)
        .set('Cookie', `dp_sess=${cookie}`)
        .send(body);
    const release = (cookie: string, slotId: string | undefined) =>
      request(app).delete(path(slotId)).set('Origin', ORIGIN).set('Cookie', `dp_sess=${cookie}`);
    const slotRow = async (id: string | undefined) =>
      (
        await db.orm
          .select()
          .from(slots)
          .where(eq(slots.id, id ?? ''))
      )[0];
    const seq = async () =>
      (await db.orm.select({ seq: events.seq }).from(events).where(eq(events.id, board.eventId)))[0]
        ?.seq;
    return {
      board,
      app,
      published,
      slots: { main0, main1, main2, side0 },
      claim,
      release,
      slotRow,
      seq,
    };
  }

  it('claim stores dish, tags, claimant and increments seq by 1', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    const before = await t.seq();

    const res = await t.claim(sam.cookie, t.slots.main0?.id);

    expect(res.status).toBe(200);
    const body = ClaimResponse.parse(res.body);
    expect(body.slot).toEqual({
      id: t.slots.main0?.id,
      category: 'main',
      position: 0,
      claimedBy: { id: sam.participantId, displayName: 'Sam' },
      dishName: 'Mushroom pie',
      dishTags: ['vegan', 'nut_free'],
    });
    expect(body.seq).toBe((before ?? 0) + 1);
    expect(await t.seq()).toBe(body.seq);
    expect(await t.slotRow(t.slots.main0?.id)).toMatchObject({
      claimedBy: sam.participantId,
      dishName: 'Mushroom pie',
      dishTags: ['vegan', 'nut_free'],
      claimedAt: clock.now(),
    });
    // Published once, after commit, with the same payload the response carries.
    expect(t.published).toEqual([{ type: 'slot.claimed', seq: body.seq, slot: body.slot }]);
  });

  it("claim on a claimed slot throws SLOT_TAKEN with the winner's name", async () => {
    const t = await setup();
    const jonah = await joinGuest(db, t.board, 'Jonah');
    const priya = await joinGuest(db, t.board, 'Priya');
    expect((await t.claim(jonah.cookie, t.slots.main0?.id)).status).toBe(200);
    const seqAfterWin = await t.seq();

    const res = await t.claim(priya.cookie, t.slots.main0?.id, {
      dishName: 'Lentil stew',
      dishTags: [],
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'SLOT_TAKEN',
      message: 'Jonah just claimed this slot.',
      claimedBy: 'Jonah',
    });
    expect((await t.slotRow(t.slots.main0?.id))?.dishName).toBe('Mushroom pie');
    expect(await t.seq()).toBe(seqAfterWin);
  });

  it('4th claim by one participant throws CLAIM_LIMIT', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    for (const slot of [t.slots.main0, t.slots.main1, t.slots.main2]) {
      expect((await t.claim(sam.cookie, slot?.id)).status).toBe(200);
    }

    const res = await t.claim(sam.cookie, t.slots.side0?.id);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'CLAIM_LIMIT',
      message: "You're already bringing 3 dishes — release one to claim another.",
    });
    expect((await t.slotRow(t.slots.side0?.id))?.claimedBy).toBeNull();
  });

  it('claim on a locked board throws BOARD_LOCKED', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    await db.orm.update(events).set({ locked: true }).where(eq(events.id, t.board.eventId));

    const res = await t.claim(sam.cookie, t.slots.main0?.id);

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('BOARD_LOCKED');
    expect((await t.slotRow(t.slots.main0?.id))?.claimedBy).toBeNull();
  });

  it('claim on a slot of another event throws NOT_FOUND', async () => {
    const t = await setup();
    const other = await createBoard(db);
    const [otherSlot] = await slotIds(db, other.eventId);
    const sam = await joinGuest(db, t.board, 'Sam');

    for (const slotId of [otherSlot?.id, 'not-a-uuid', '00000000-0000-4000-8000-000000000000']) {
      const res = await t.claim(sam.cookie, slotId);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect((await t.slotRow(otherSlot?.id))?.claimedBy).toBeNull();
  });

  it('dish name with SQL metacharacters is stored verbatim', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    const dishName = `Bobby's "pie"'); DROP TABLE slots;--`;

    const res = await t.claim(sam.cookie, t.slots.main0?.id, { dishName, dishTags: [] });

    expect(res.status).toBe(200);
    expect((await t.slotRow(t.slots.main0?.id))?.dishName).toBe(dishName);
  });

  it('returns 400 VALIDATION for an empty dish or unknown tag and 404 without a session', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');

    const invalid = await t.claim(sam.cookie, t.slots.main0?.id, {
      dishName: ' ',
      dishTags: ['keto'],
    });
    expect(invalid.status).toBe(400);
    expect(Object.keys(invalid.body.error.fields).sort()).toEqual(['dishName', 'dishTags.0']);

    const anonymous = await request(t.app)
      .post(`/api/events/${t.board.eventId}/slots/${t.slots.main0?.id}/claim`)
      .set('Origin', ORIGIN)
      .send(pie);
    expect(anonymous.status).toBe(404);
  });

  it('release by owner reopens the slot', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    await t.claim(sam.cookie, t.slots.main0?.id);
    t.published.length = 0;

    const res = await t.release(sam.cookie, t.slots.main0?.id);

    expect(res.status).toBe(200);
    const body = ClaimResponse.parse(res.body);
    expect(body.slot).toMatchObject({ claimedBy: null, dishName: null, dishTags: [] });
    expect(await t.slotRow(t.slots.main0?.id)).toMatchObject({
      claimedBy: null,
      dishName: null,
      dishTags: [],
      claimedAt: null,
    });
    expect(t.published).toEqual([
      { type: 'slot.released', seq: body.seq, slotId: t.slots.main0?.id, actorRole: 'guest' },
    ]);
  });

  it('release by non-owner returns 403 NOT_OWNER and slot is unchanged', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    const reza = await joinGuest(db, t.board, 'Reza');
    await t.claim(sam.cookie, t.slots.main0?.id);
    const before = await t.seq();

    const res = await t.release(reza.cookie, t.slots.main0?.id);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'NOT_OWNER', message: "That isn't your claim." });
    expect((await t.slotRow(t.slots.main0?.id))?.claimedBy).toBe(sam.participantId);
    expect(await t.seq()).toBe(before);
  });

  it('release by host succeeds and logs actorRole host', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    await t.claim(sam.cookie, t.slots.main0?.id);

    const res = await t.release(t.board.sessionToken, t.slots.main0?.id);

    expect(res.status).toBe(200);
    const [logged] = await db.orm
      .select({ type: eventLog.type, payload: eventLog.payload })
      .from(eventLog)
      .where(eq(eventLog.seq, res.body.seq));
    expect(logged).toEqual({
      type: 'slot.released',
      payload: { slotId: t.slots.main0?.id, actorRole: 'host' },
    });
  });

  it('release on an open slot throws NOT_CLAIMED', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');

    const res = await t.release(sam.cookie, t.slots.main0?.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_CLAIMED');
  });

  it('release on a locked board throws BOARD_LOCKED', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    await t.claim(sam.cookie, t.slots.main0?.id);
    await db.orm.update(events).set({ locked: true }).where(eq(events.id, t.board.eventId));

    const res = await t.release(sam.cookie, t.slots.main0?.id);

    expect(res.status).toBe(423);
    expect((await t.slotRow(t.slots.main0?.id))?.claimedBy).toBe(sam.participantId);
  });

  it('31st claim or release in a minute from one session returns 429', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    for (let i = 0; i < 15; i++) {
      expect((await t.claim(sam.cookie, t.slots.main0?.id)).status).toBe(200);
      expect((await t.release(sam.cookie, t.slots.main0?.id)).status).toBe(200);
    }

    const res = await t.claim(sam.cookie, t.slots.main0?.id);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    // Another guest's session has its own budget.
    const reza = await joinGuest(db, t.board, 'Reza');
    expect((await t.claim(reza.cookie, t.slots.main1?.id)).status).toBe(200);
  });

  it('logs claims in seq order with no gaps', async () => {
    const t = await setup();
    const sam = await joinGuest(db, t.board, 'Sam');
    await t.claim(sam.cookie, t.slots.main0?.id);
    await t.release(sam.cookie, t.slots.main0?.id);
    const rows = await db.orm
      .select({ seq: eventLog.seq, type: eventLog.type })
      .from(eventLog)
      .where(eq(eventLog.eventId, t.board.eventId))
      .orderBy(asc(eventLog.seq));
    expect(rows).toEqual([
      { seq: 1, type: 'participant.joined' },
      { seq: 2, type: 'slot.claimed' },
      { seq: 3, type: 'slot.released' },
    ]);
  });
});
