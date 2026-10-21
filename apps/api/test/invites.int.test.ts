import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { generateToken } from '../src/domain/tokens.ts';
import { afterExpiry, clock, createBoard } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { post } from './helpers/requests.ts';

describe('GET /api/invites/:inviteToken', () => {
  const db = useTestDb();

  it('preview returns title, date, host name and count but no participant names', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    await post(app, `/api/invites/${board.inviteToken}/join`, {
      displayName: 'Secret Sam',
      dietaryNeeds: ['nut_free'],
    });

    const res = await request(app).get(`/api/invites/${board.inviteToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      title: "Friendsgiving at Mina's",
      startsAt: '2026-11-21T17:00:00.000Z',
      location: "Mina's flat, 3rd floor",
      hostName: 'Mina',
      participantCount: 2,
    });
    expect(res.text).not.toContain('Secret Sam');
    expect(res.text).not.toContain('nut_free');
    expect(res.text).not.toContain(board.eventId);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('unknown token returns 404 INVITE_INVALID', async () => {
    await createBoard(db);
    const { app } = intApp(db, { clock });
    for (const token of [generateToken(), 'bogus']) {
      const res = await request(app).get(`/api/invites/${token}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatchObject({
        code: 'INVITE_INVALID',
        message: "This invite link doesn't work anymore.",
      });
    }
  });

  it('invalid, rotated and expired invites return byte-identical bodies apart from requestId', async () => {
    const rotated = await createBoard(db);
    await db.sql`update events set invite_token_hash = sha256('rotated'::bytea) where id = ${rotated.eventId}`;
    const expired = await createBoard(db);

    const responses = await Promise.all([
      request(intApp(db, { clock }).app).get(`/api/invites/${generateToken()}`),
      request(intApp(db, { clock }).app).get(`/api/invites/${rotated.inviteToken}`),
      request(intApp(db, { clock: afterExpiry }).app).get(`/api/invites/${expired.inviteToken}`),
      post(intApp(db, { clock: afterExpiry }).app, `/api/invites/${expired.inviteToken}/join`, {
        displayName: 'Sam',
        dietaryNeeds: [],
      }),
    ]);
    const normalised = responses.map((res) => {
      expect(res.status).toBe(404);
      return res.text.replace(/"requestId":"[^"]+"/, '"requestId":"x"');
    });
    expect(new Set(normalised).size).toBe(1);
  });

  it('preview is rate limited after 30 requests per minute', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    for (let i = 0; i < 30; i++) {
      expect((await request(app).get(`/api/invites/${board.inviteToken}`)).status).toBe(200);
    }
    const res = await request(app).get(`/api/invites/${board.inviteToken}`);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
