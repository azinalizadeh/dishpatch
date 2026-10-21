import { describe, expect, it } from 'vitest';
import { resolveActor } from '../src/middleware/session.ts';
import { afterExpiry, clock, createBoard } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { post, sessionCookie } from './helpers/requests.ts';

describe('guest sessions', () => {
  const db = useTestDb();

  it('session cookie is HttpOnly, SameSite=Strict and Path-scoped to the event', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });

    const res = await post(app, `/api/invites/${board.inviteToken}/join`, {
      displayName: 'Sam',
      dietaryNeeds: [],
    });

    const cookie = sessionCookie(res.headers['set-cookie']);
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining(['httponly', 'samesite=strict', `path=/api/events/${board.eventId}`]),
    );
    // Max-Age runs until the board expires (starts_at + 14 days), counted from the fixed clock.
    const seconds = (Date.parse('2026-12-05T17:00:00Z') - clock.now().getTime()) / 1000;
    expect(cookie?.attributes).toContain(`max-age=${seconds}`);

    const actor = await resolveActor(db, clock, cookie?.value, board.eventId);
    expect(actor).toEqual({
      eventId: board.eventId,
      participantId: res.body.participantId,
      role: 'guest',
    });
  });

  it('expired session resolves to null', async () => {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    const res = await post(app, `/api/invites/${board.inviteToken}/join`, {
      displayName: 'Sam',
      dietaryNeeds: [],
    });
    const token = sessionCookie(res.headers['set-cookie'])?.value;

    expect(await resolveActor(db, afterExpiry, token, board.eventId)).toBeNull();
    // A guest session is scoped to its own board.
    const other = await createBoard(db);
    expect(await resolveActor(db, clock, token, other.eventId)).toBeNull();
  });
});
