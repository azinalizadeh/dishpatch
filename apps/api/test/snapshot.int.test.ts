import { Snapshot } from '@dishpatch/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { clock, createBoard } from './helpers/boards.ts';
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
});
