import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { friendsgivingPayload } from '../../../packages/shared/test/fixtures/create-event.ts';
import { createDb } from '../src/db/client.ts';
import { resolveActor } from '../src/middleware/session.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { post, sessionCookie } from './helpers/requests.ts';
import { fixedClock, testEnv } from './helpers/test-app.ts';

const clock = fixedClock('2026-10-20T12:00:00Z');
// The shared schema checks "in the future" against the real clock, so the date must stay ahead of it.
const payload = () => ({
  ...friendsgivingPayload(clock.now()),
  startsAt: '2099-11-21T17:00:00.000Z',
});

describe('POST /api/events', () => {
  const db = useTestDb();

  it('POST /api/events returns 201 with inviteUrl, hostUrl and an HttpOnly host cookie', async () => {
    const { app } = intApp(db, { clock });
    const res = await post(app, '/api/events', payload());

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['eventId', 'hostUrl', 'inviteUrl']);
    expect(res.body.inviteUrl).toMatch(/^http:\/\/localhost:5173\/e\/[A-Za-z0-9_-]{43}$/);
    expect(res.body.hostUrl).toMatch(/^http:\/\/localhost:5173\/h\/[A-Za-z0-9_-]{43}$/);

    const cookie = sessionCookie(res.headers['set-cookie']);
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // 2026-10-20T12:00Z → expires_at 2099-12-05T17:00Z
    const maxAge = (Date.parse('2099-12-05T17:00:00Z') - Date.parse('2026-10-20T12:00:00Z')) / 1000;
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining([
        'httponly',
        'samesite=strict',
        `path=/api/events/${res.body.eventId}`,
        `max-age=${maxAge}`,
      ]),
    );
    expect(cookie?.attributes).not.toContain('secure');

    const actor = await resolveActor(db, clock, cookie?.value, res.body.eventId);
    expect(actor).toMatchObject({ eventId: res.body.eventId, role: 'host' });
  });

  it('6th create within an hour from one IP returns 429', async () => {
    const { app } = intApp(db, { clock });
    for (let i = 0; i < 5; i++) {
      expect((await post(app, '/api/events', payload())).status).toBe(201);
    }
    const res = await post(app, '/api/events', payload());
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({
      code: 'RATE_LIMITED',
      message: "You've made a lot of boards — try again in a bit.",
    });
    expect(res.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('behind one trusted proxy, a spoofed X-Forwarded-For does not reset the create limit', async () => {
    const { app } = intApp(db, { clock, env: testEnv({ TRUST_PROXY: '1' }) });
    // The proxy appends the address it saw; everything left of it came from the client.
    const create = (spoofed: string) =>
      post(app, '/api/events', payload()).set('X-Forwarded-For', `${spoofed}, 203.0.113.7`);
    for (let i = 0; i < 5; i++) expect((await create(`10.0.0.${i}`)).status).toBe(201);
    expect((await create('10.0.0.99')).status).toBe(429);
  });

  it('rejects body over 16 KB with 413', async () => {
    const { app } = intApp(db, { clock });
    const res = await post(app, '/api/events', { ...payload(), title: 'x'.repeat(17 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns 400 VALIDATION with field messages and creates nothing', async () => {
    const { app } = intApp(db, { clock });
    const res = await post(app, '/api/events', {
      ...payload(),
      startsAt: '2020-01-01T00:00:00.000Z',
      hostName: ' ',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION',
      fields: {
        startsAt: 'Pick a date in the future.',
        hostName: "Add a name so guests know who's hosting.",
      },
    });
    expect(await db.sql`select id from events`).toHaveLength(0);
  });

  it('rejects a cross-origin create with 403 BAD_ORIGIN', async () => {
    const { app } = intApp(db, { clock });
    const missing = await request(app).post('/api/events').send(payload());
    const foreign = await request(app)
      .post('/api/events')
      .set('Origin', 'https://evil.example')
      .send(payload());
    for (const res of [missing, foreign]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('BAD_ORIGIN');
    }
    expect(await db.sql`select id from events`).toHaveLength(0);
  });

  it('returns 500 INTERNAL with a requestId when the database is down', async () => {
    const down = createDb('postgres://nobody:nothing@127.0.0.1:1/none');
    const { app } = intApp(down, { clock });
    const res = await post(app, '/api/events', payload());
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.requestId).toMatch(/^req-/);
    await down.sql.end({ timeout: 1 });
  });
});
