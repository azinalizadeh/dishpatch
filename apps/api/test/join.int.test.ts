import { describe, expect, it } from 'vitest';
import { afterExpiry, clock, createBoard } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { post, sessionCookie } from './helpers/requests.ts';

const sam = { displayName: 'Sam', dietaryNeeds: ['vegan'] };

describe('POST /api/invites/:inviteToken/join', () => {
  const db = useTestDb();

  it('returns 201 with eventId and participantId and a guest cookie', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });

    const res = await post(app, `/api/invites/${board.inviteToken}/join`, sam);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['eventId', 'participantId']);
    expect(res.body.eventId).toBe(board.eventId);
    expect(sessionCookie(res.headers['set-cookie'])?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('rejects case-insensitive duplicate name with 409 NAME_TAKEN', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    expect((await post(app, `/api/invites/${board.inviteToken}/join`, sam)).status).toBe(201);

    const res = await post(app, `/api/invites/${board.inviteToken}/join`, {
      displayName: '  sAm ',
      dietaryNeeds: [],
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'NAME_TAKEN',
      message: 'Someone called Sam is already here — add an initial?',
    });
    expect(res.headers['set-cookie']).toBeUndefined();
    // The host's name counts too.
    const host = await post(app, `/api/invites/${board.inviteToken}/join`, {
      displayName: 'MINA',
      dietaryNeeds: [],
    });
    expect(host.body.error.code).toBe('NAME_TAKEN');
  });

  it('returns 400 VALIDATION for a blank name or unknown need', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    const res = await post(app, `/api/invites/${board.inviteToken}/join`, {
      displayName: '   ',
      dietaryNeeds: ['keto'],
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['dietaryNeeds.0', 'displayName']);
  });

  it('returns 404 INVITE_INVALID for an expired board', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock: afterExpiry });
    const res = await post(app, `/api/invites/${board.inviteToken}/join`, sam);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVITE_INVALID');
  });

  it('requires the app origin', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    const res = await post(app, `/api/invites/${board.inviteToken}/join`, sam).set(
      'Origin',
      'https://evil.example',
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });

  it('11th join attempt in a minute returns 429', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    for (let i = 0; i < 10; i++) {
      const res = await post(app, `/api/invites/${board.inviteToken}/join`, {
        displayName: `Guest ${i}`,
        dietaryNeeds: [],
      });
      expect(res.status).toBe(201);
    }
    const res = await post(app, `/api/invites/${board.inviteToken}/join`, sam);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
