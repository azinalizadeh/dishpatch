import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { friendsgivingPayload } from '../../../packages/shared/test/fixtures/create-event.ts';
import { createEvent } from '../src/domain/events.ts';
import { generateToken } from '../src/domain/tokens.ts';
import { resolveActor } from '../src/middleware/session.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { post, sessionCookie } from './helpers/requests.ts';
import { fixedClock } from './helpers/test-app.ts';

const clock = fixedClock('2026-10-20T12:00:00Z');
const input = () => ({
  ...friendsgivingPayload(clock.now()),
  startsAt: '2026-11-21T17:00:00.000Z',
});

describe('POST /api/host-links/:hostToken/session', () => {
  const db = useTestDb();

  it('valid host token sets a host session for that event', async () => {
    const created = await createEvent(db, clock, input());
    const { app } = intApp(db, { clock });

    const res = await post(app, `/api/host-links/${created.hostToken}/session`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eventId: created.eventId });
    const cookie = sessionCookie(res.headers['set-cookie']);
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining([
        'httponly',
        'samesite=strict',
        `path=/api/events/${created.eventId}`,
      ]),
    );
    // A fresh session, not the one handed out at create time.
    expect(cookie?.value).not.toBe(created.sessionToken);
    const actor = await resolveActor(db, clock, cookie?.value, created.eventId);
    expect(actor).toEqual({
      eventId: created.eventId,
      participantId: created.hostParticipantId,
      role: 'host',
    });
    // The session is scoped to its own event.
    const other = await createEvent(db, clock, input());
    expect(await resolveActor(db, clock, cookie?.value, other.eventId)).toBeNull();
  });

  it('unknown token returns 404 NOT_FOUND', async () => {
    await createEvent(db, clock, input());
    const { app } = intApp(db, { clock });
    for (const token of [generateToken(), 'not-a-token']) {
      const res = await post(app, `/api/host-links/${token}/session`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('the invite token is not a host link, and expired boards are not found', async () => {
    const created = await createEvent(db, clock, input());
    const { app } = intApp(db, { clock });
    expect((await post(app, `/api/host-links/${created.inviteToken}/session`)).status).toBe(404);

    const later = intApp(db, { clock: fixedClock('2026-12-06T00:00:00Z') });
    const res = await post(later.app, `/api/host-links/${created.hostToken}/session`);
    expect(res.status).toBe(404);
  });

  it('11th host-link attempt in a minute returns 429', async () => {
    const { app } = intApp(db, { clock });
    for (let i = 0; i < 10; i++) {
      expect((await post(app, `/api/host-links/${generateToken()}/session`)).status).toBe(404);
    }
    const res = await post(app, `/api/host-links/${generateToken()}/session`);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('requires the app origin', async () => {
    const created = await createEvent(db, clock, input());
    const { app } = intApp(db, { clock });
    const res = await request(app).post(`/api/host-links/${created.hostToken}/session`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });
});
