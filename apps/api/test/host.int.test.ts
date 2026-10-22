import {
  type BoardEvent,
  ClaimResponse,
  RotateInviteResponse,
  SeqResponse,
  Snapshot,
  UpdateEventResponse,
} from '@dishpatch/shared';
import { and, asc, count, eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { eventLog, events, participants, sessions, slots } from '../src/db/schema.ts';
import { createInProcessEventBus } from '../src/realtime/event-bus.ts';
import { createEventLogRepo } from '../src/realtime/event-log.ts';
import { clock, createBoard, joinGuest, slotIds } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { ORIGIN } from './helpers/requests.ts';

const TITLE = "Friendsgiving at Mina's";

describe('host controls', () => {
  const db = useTestDb();

  async function setup() {
    const board = await createBoard(db);
    const guest = await joinGuest(db, board, 'Reza', ['halal']);
    const bus = createInProcessEventBus();
    const published: BoardEvent[] = [];
    bus.subscribe(board.eventId, (m) => published.push(m));
    const { app } = intApp(db, { clock, bus });
    const base = `/api/events/${board.eventId}`;
    const as = (cookie: string) => ({
      patch: (path: string, body: object) =>
        request(app)
          .patch(`${base}${path}`)
          .set('Origin', ORIGIN)
          .set('Cookie', `dp_sess=${cookie}`)
          .send(body),
      post: (path: string, body?: object) => {
        const req = request(app)
          .post(`${base}${path}`)
          .set('Origin', ORIGIN)
          .set('Cookie', `dp_sess=${cookie}`);
        return body === undefined ? req : req.send(body);
      },
      delete: (path: string, body?: object) => {
        const req = request(app)
          .delete(`${base}${path}`)
          .set('Origin', ORIGIN)
          .set('Cookie', `dp_sess=${cookie}`);
        return body === undefined ? req : req.send(body);
      },
      get: (path = '') => request(app).get(`${base}${path}`).set('Cookie', `dp_sess=${cookie}`),
    });
    const host = as(board.sessionToken);
    const reza = as(guest.cookie);
    const seq = async () =>
      (await db.orm.select({ seq: events.seq }).from(events).where(eq(events.id, board.eventId)))[0]
        ?.seq;
    const claim = (who: ReturnType<typeof as>, slotId: string | undefined) =>
      who.post(`/slots/${slotId}/claim`, { dishName: 'Ghormeh sabzi', dishTags: ['halal'] });
    return { board, guest, app, host, reza, published, seq, claim };
  }

  describe('requireHost (E1): one guest negative test per host route', () => {
    it('guest PATCH lock returns 403 HOST_ONLY', async () => {
      const { reza, seq } = await setup();
      const before = await seq();
      const res = await reza.patch('', { locked: true });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('HOST_ONLY');
      expect(await seq()).toBe(before);
    });

    it('guest adding a slot returns 403 HOST_ONLY', async () => {
      const { reza } = await setup();
      const res = await reza.post('/slots', { category: 'main' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('HOST_ONLY');
    });

    it('guest removing a slot returns 403 HOST_ONLY', async () => {
      const { board, reza } = await setup();
      const [main0] = await slotIds(db, board.eventId);
      const res = await reza.delete(`/slots/${main0?.id}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('HOST_ONLY');
    });

    it('guest rotating the invite returns 403 HOST_ONLY', async () => {
      const { board, app, reza } = await setup();
      const res = await reza.post('/invite/rotate');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('HOST_ONLY');
      expect((await request(app).get(`/api/invites/${board.inviteToken}`)).status).toBe(200);
    });

    it('guest deleting the board returns 403 HOST_ONLY', async () => {
      const { board, reza } = await setup();
      const res = await reza.delete('', { confirmTitle: TITLE });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('HOST_ONLY');
      const [row] = await db.orm.select().from(events).where(eq(events.id, board.eventId));
      expect(row).toBeDefined();
    });
  });

  describe('lock', () => {
    it('host lock sets locked, bumps seq and publishes event.updated', async () => {
      const { host, published, seq } = await setup();
      const before = (await seq()) ?? 0;

      const res = await host.patch('', { locked: true });

      expect(res.status).toBe(200);
      const body = UpdateEventResponse.parse(res.body);
      expect(body.event.locked).toBe(true);
      expect(body.seq).toBe(before + 1);
      expect(published).toEqual([{ type: 'event.updated', seq: before + 1, locked: true }]);
      const snapshot = Snapshot.parse((await host.get()).body);
      expect(snapshot.event.locked).toBe(true);
    });

    it('claim after lock returns 423 BOARD_LOCKED', async () => {
      const { board, host, reza, claim } = await setup();
      const [main0, main1] = await slotIds(db, board.eventId);
      expect((await claim(reza, main1?.id)).status).toBe(200);
      await host.patch('', { locked: true });

      const claimed = await claim(reza, main0?.id);
      const released = await reza.delete(`/slots/${main1?.id}/claim`);
      // Locked blocks everyone, the host included: unlock first.
      const hostRelease = await host.delete(`/slots/${main1?.id}/claim`);

      for (const res of [claimed, released, hostRelease]) {
        expect(res.status).toBe(423);
        expect(res.body.error.code).toBe('BOARD_LOCKED');
      }
      expect(hostRelease.body.error.message).toMatch(/unlock/);
    });

    it('locking a locked board changes nothing and announces nothing', async () => {
      const { host, published, seq } = await setup();
      await host.patch('', { locked: true });
      const after = await seq();
      const again = await host.patch('', { locked: true });
      expect(again.status).toBe(200);
      expect(UpdateEventResponse.parse(again.body)).toMatchObject({
        event: { locked: true },
        seq: after,
      });
      expect(await seq()).toBe(after);
      expect(published).toHaveLength(1);
    });

    it('unlocking reopens claims', async () => {
      const { board, host, reza, claim } = await setup();
      const [main0] = await slotIds(db, board.eventId);
      await host.patch('', { locked: true });
      await host.patch('', { locked: false });
      expect((await claim(reza, main0?.id)).status).toBe(200);
    });

    it('rejects a body without a boolean locked', async () => {
      const { host } = await setup();
      const res = await host.patch('', { locked: 'yes' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    });

    it('two host devices toggling at once leave the last write and a gap-free seq', async () => {
      const { host, published, seq } = await setup();
      const before = (await seq()) ?? 0;
      await Promise.all([host.patch('', { locked: true }), host.patch('', { locked: false })]);
      const sequenced = published.filter((m) => m.type === 'event.updated');
      expect(sequenced.map((m) => ('seq' in m ? m.seq : 0)).sort()).toEqual([
        before + 1,
        before + 2,
      ]);
      const last = sequenced.find((m) => 'seq' in m && m.seq === before + 2);
      const snapshot = Snapshot.parse((await host.get()).body);
      expect(last && 'locked' in last ? last.locked : undefined).toBe(snapshot.event.locked);
    });
  });

  describe('invite rotation (E2)', () => {
    it('rotated-out invite token returns 404 on preview and join', async () => {
      const { board, app, host } = await setup();

      const res = await host.post('/invite/rotate');

      expect(res.status).toBe(200);
      const { inviteUrl } = RotateInviteResponse.parse(res.body);
      const fresh = new URL(inviteUrl).pathname.replace('/e/', '');
      expect(fresh).not.toBe(board.inviteToken);

      const preview = await request(app).get(`/api/invites/${board.inviteToken}`);
      const join = await request(app)
        .post(`/api/invites/${board.inviteToken}/join`)
        .set('Origin', ORIGIN)
        .send({ displayName: 'Sam', dietaryNeeds: [] });
      for (const r of [preview, join]) {
        expect(r.status).toBe(404);
        expect(r.body.error.code).toBe('INVITE_INVALID');
      }
      expect((await request(app).get(`/api/invites/${fresh}`)).status).toBe(200);
    });

    it('existing guest sessions still work after rotation', async () => {
      const { board, host, reza, claim } = await setup();
      await host.post('/invite/rotate');
      const [main0] = await slotIds(db, board.eventId);
      expect((await reza.get()).status).toBe(200);
      expect((await claim(reza, main0?.id)).status).toBe(200);
    });

    it('logs invite.rotated (actor trail) and streams it without the link, so seq stays gap-free', async () => {
      const { board, host, published, seq } = await setup();
      const before = (await seq()) ?? 0;

      const { body } = await host.post('/invite/rotate');
      expect(body.seq).toBe(before + 1);
      await host.patch('', { locked: true });

      expect(published).toEqual([
        { type: 'invite.rotated', seq: before + 1 },
        { type: 'event.updated', seq: before + 2, locked: true },
      ]);
      expect(JSON.stringify(published)).not.toContain(new URL(body.inviteUrl).pathname);
      const logged = await db.orm
        .select({ type: eventLog.type, payload: eventLog.payload })
        .from(eventLog)
        .where(and(eq(eventLog.eventId, board.eventId), eq(eventLog.seq, before + 1)));
      expect(logged).toEqual([{ type: 'invite.rotated', payload: {} }]);
      expect(JSON.stringify(logged)).not.toContain(board.inviteToken);
      const replay = await createEventLogRepo(db).since(board.eventId, before);
      expect(replay).toEqual(published);
    });

    it("guests' refused rotations don't use up the host's 5 per hour", async () => {
      const { host, reza } = await setup();
      for (let i = 0; i < 6; i++) expect((await reza.post('/invite/rotate')).status).toBe(403);
      expect((await host.post('/invite/rotate')).status).toBe(200);
    });

    it('is limited to 5 rotations per hour per board', async () => {
      const { host } = await setup();
      for (let i = 0; i < 5; i++) expect((await host.post('/invite/rotate')).status).toBe(200);
      const res = await host.post('/invite/rotate');
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('slots', () => {
    it('adds an open slot in the lowest free position and publishes slot.added', async () => {
      const { board, host, published } = await setup();
      const [, main1] = await slotIds(db, board.eventId);
      await host.delete(`/slots/${main1?.id}`);

      const res = await host.post('/slots', { category: 'main' });

      expect(res.status).toBe(201);
      const { slot, seq } = ClaimResponse.parse(res.body);
      expect(slot).toMatchObject({ category: 'main', position: 1, claimedBy: null });
      expect(published.at(-1)).toEqual({ type: 'slot.added', seq, slot });
    });

    it('adding a 13th main returns 409 SLOT_LIMIT', async () => {
      const { host } = await setup();
      for (let i = 0; i < 9; i++) {
        expect((await host.post('/slots', { category: 'main' })).status).toBe(201);
      }
      const res = await host.post('/slots', { category: 'main' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SLOT_LIMIT');
    });

    it('adding a 41st slot returns 409 SLOT_LIMIT', async () => {
      const { host } = await setup();
      const adds: [string, number][] = [
        ['main', 9],
        ['side', 9],
        ['salad', 10],
      ];
      for (const [category, times] of adds) {
        for (let i = 0; i < times; i++) {
          expect((await host.post('/slots', { category })).status).toBe(201);
        }
      }
      const res = await host.post('/slots', { category: 'dessert' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'SLOT_LIMIT', message: /40 slots/ });
    });

    it('removes an open slot and publishes slot.removed', async () => {
      const { board, host, published } = await setup();
      const [main0] = await slotIds(db, board.eventId);

      const res = await host.delete(`/slots/${main0?.id}`);

      expect(res.status).toBe(200);
      const { seq } = SeqResponse.parse(res.body);
      expect(published.at(-1)).toEqual({ type: 'slot.removed', seq, slotId: main0?.id });
      expect(await slotIds(db, board.eventId)).toHaveLength(11);
    });

    it('removing a claimed slot returns 409 SLOT_CLAIMED', async () => {
      const { board, host, reza, claim } = await setup();
      const [main0] = await slotIds(db, board.eventId);
      await claim(reza, main0?.id);

      const res = await host.delete(`/slots/${main0?.id}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SLOT_CLAIMED');
      expect(await slotIds(db, board.eventId)).toHaveLength(12);
    });

    it("can't remove another board's slot", async () => {
      const { host } = await setup();
      const other = await createBoard(db);
      const [theirs] = await slotIds(db, other.eventId);
      const res = await host.delete(`/slots/${theirs?.id}`);
      expect(res.status).toBe(404);
      expect(await slotIds(db, other.eventId)).toHaveLength(12);
    });

    it('host removing a claim writes slot.released with actorRole host', async () => {
      const { board, host, reza, claim, published } = await setup();
      const [main0] = await slotIds(db, board.eventId);
      await claim(reza, main0?.id);

      const res = await host.delete(`/slots/${main0?.id}/claim`);

      expect(res.status).toBe(200);
      const { seq } = ClaimResponse.parse(res.body);
      expect(published.at(-1)).toEqual({
        type: 'slot.released',
        seq,
        slotId: main0?.id,
        actorRole: 'host',
      });
      const [row] = await db.orm
        .select({ payload: eventLog.payload })
        .from(eventLog)
        .where(and(eq(eventLog.eventId, board.eventId), eq(eventLog.seq, seq)));
      expect(row?.payload).toMatchObject({ actorRole: 'host' });
    });
  });

  describe('delete', () => {
    it('delete with wrong confirmTitle returns 400 CONFIRM_MISMATCH', async () => {
      const { board, host } = await setup();
      for (const confirmTitle of ['Friendsgiving', TITLE.toLowerCase(), ` ${TITLE}`]) {
        const res = await host.delete('', { confirmTitle });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('CONFIRM_MISMATCH');
      }
      const missing = await host.delete('');
      expect(missing.status).toBe(400);
      expect(missing.body.error.code).toBe('VALIDATION');
      const [row] = await db.orm.select().from(events).where(eq(events.id, board.eventId));
      expect(row).toBeDefined();
    });

    it('delete removes event, participants, sessions, slots and log rows', async () => {
      const { board, host, reza, claim, published } = await setup();
      const [main0] = await slotIds(db, board.eventId);
      await claim(reza, main0?.id);
      const other = await createBoard(db);

      const res = await host.delete('', { confirmTitle: TITLE });

      expect(res.status).toBe(204);
      expect(published.at(-1)).toEqual({ type: 'event.deleted' });
      const counts = await Promise.all([
        db.orm.select({ n: count() }).from(events).where(eq(events.id, board.eventId)),
        db.orm
          .select({ n: count() })
          .from(participants)
          .where(eq(participants.eventId, board.eventId)),
        db.orm
          .select({ n: count() })
          .from(sessions)
          .innerJoin(participants, eq(participants.id, sessions.participantId))
          .where(eq(participants.eventId, board.eventId)),
        db.orm.select({ n: count() }).from(slots).where(eq(slots.eventId, board.eventId)),
        db.orm.select({ n: count() }).from(eventLog).where(eq(eventLog.eventId, board.eventId)),
      ]);
      expect(counts.map(([row]) => row?.n)).toEqual([0, 0, 0, 0, 0]);
      // Sessions are joined through participants above, so also check none are orphaned.
      const allSessions = await db.orm
        .select({ participantId: sessions.participantId })
        .from(sessions)
        .orderBy(asc(sessions.createdAt));
      const otherHost = await db.orm
        .select({ id: participants.id })
        .from(participants)
        .where(eq(participants.eventId, other.eventId));
      expect(allSessions.map((s) => s.participantId)).toEqual(otherHost.map((p) => p.id));

      // Everyone, the host included, now gets the not-found answer.
      expect((await host.get()).status).toBe(404);
      expect((await reza.get()).status).toBe(404);
    });

    it('a claim after delete gets 404', async () => {
      const { board, host, reza, claim } = await setup();
      const [main0] = await slotIds(db, board.eventId);
      await host.delete('', { confirmTitle: TITLE });
      expect((await claim(reza, main0?.id)).status).toBe(404);
    });
  });
});
