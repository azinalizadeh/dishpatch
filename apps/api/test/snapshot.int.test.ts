import { computeCoverage, type Dietary, Snapshot } from '@dishpatch/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { participants, slots } from '../src/db/schema.ts';
import { clock, createBoard, createMockupBoard } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { post, sessionCookie } from './helpers/requests.ts';

describe('GET /api/events/:eventId', () => {
  const db = useTestDb();

  it('returns slots, participants, me and seq for a member', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    const joined = await post(app, `/api/invites/${board.inviteToken}/join`, {
      displayName: 'Sam',
      dietaryNeeds: ['vegan'],
    });
    const cookie = sessionCookie(joined.headers['set-cookie'])?.value;

    const res = await request(app)
      .get(`/api/events/${board.eventId}`)
      .set('Cookie', `dp_sess=${cookie}`);

    expect(res.status).toBe(200);
    const snapshot = Snapshot.parse(res.body);
    expect(snapshot.event).toMatchObject({ id: board.eventId, locked: false });
    expect(snapshot.slots).toHaveLength(12);
    expect(snapshot.participants.map((p) => [p.displayName, p.role])).toEqual([
      ['Mina', 'host'],
      ['Sam', 'guest'],
    ]);
    expect(snapshot.me).toEqual({ participantId: joined.body.participantId, role: 'guest' });
    expect(snapshot.seq).toBe(1);
  });

  it('snapshot coverage equals computeCoverage of the stored data', async () => {
    const board = await createMockupBoard(db);
    const { app } = intApp(db, { clock });

    const res = await request(app)
      .get(`/api/events/${board.eventId}`)
      .set('Cookie', `dp_sess=${board.sessionToken}`);

    expect(res.status).toBe(200);
    const snapshot = Snapshot.parse(res.body);
    // Recomputed from the rows in the database, not from the response's own lists.
    const people = await db.orm
      .select({ dietaryNeeds: participants.dietaryNeeds })
      .from(participants)
      .where(eq(participants.eventId, board.eventId));
    const rows = await db.orm
      .select({
        id: slots.id,
        category: slots.category,
        claimedBy: slots.claimedBy,
        dishTags: slots.dishTags,
      })
      .from(slots)
      .where(eq(slots.eventId, board.eventId));
    const stored = computeCoverage(
      people.map((p) => ({ dietaryNeeds: p.dietaryNeeds as Dietary[] })),
      rows.map((r) => ({
        ...r,
        claimedBy: r.claimedBy ? { id: r.claimedBy, displayName: '' } : null,
        dishTags: r.dishTags as Dietary[],
      })),
    );
    expect(snapshot.coverage).toEqual(stored);
    expect(snapshot.coverage.map((row) => [row.need, row.status])).toEqual([
      ['nut_free', 'gap'],
      ['vegan', 'thin'],
      ['halal', 'ok'],
      ['gluten_free', 'ok'],
    ]);
  });

  it("coverage counts only this board's participants (I4)", async () => {
    const board = await createBoard(db);
    await createMockupBoard(db);
    const { app } = intApp(db, { clock });

    const res = await request(app)
      .get(`/api/events/${board.eventId}`)
      .set('Cookie', `dp_sess=${board.sessionToken}`);

    expect(Snapshot.parse(res.body).coverage).toEqual([]);
  });

  it('returns 404 (not 403) without a session for an existing event', async () => {
    const board = await createBoard(db);
    const other = await createBoard(db);
    const { app } = intApp(db, { clock });

    const anonymous = await request(app).get(`/api/events/${board.eventId}`);
    const wrongBoard = await request(app)
      .get(`/api/events/${board.eventId}`)
      .set('Cookie', `dp_sess=${other.sessionToken}`);

    for (const res of [anonymous, wrongBoard]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('is rate limited after 120 requests per minute per session', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    const get = () =>
      request(app)
        .get(`/api/events/${board.eventId}`)
        .set('Cookie', `dp_sess=${board.sessionToken}`);
    for (let i = 0; i < 120; i++) expect((await get()).status).toBe(200);
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('caps failed board lookups at 30 per minute per IP, before any session lookup', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    const probe = () =>
      request(app)
        .get(`/api/events/${board.eventId}`)
        .set('Cookie', `dp_sess=${'p'.repeat(43)}`);
    for (let i = 0; i < 30; i++) expect((await probe()).status).toBe(404);
    expect((await probe()).status).toBe(429);
  });

  it('concurrent members behind one IP are not counted as failed lookups', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    const get = () =>
      request(app)
        .get(`/api/events/${board.eventId}`)
        .set('Cookie', `dp_sess=${board.sessionToken}`);

    const results = await Promise.all(Array.from({ length: 40 }, get));

    expect(results.every((r) => r.status === 200)).toBe(true);
  });
});
