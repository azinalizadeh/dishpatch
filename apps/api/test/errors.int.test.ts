import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { intApp, useTestDb } from './helpers/int-app.ts';

describe('error handling', () => {
  const db = useTestDb();
  const { app } = intApp(db);

  it('500 response has no stack trace and includes requestId', async () => {
    const res = await request(app).get('/api/__test/error');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong on our side. Please try again.',
        requestId: res.headers['x-request-id'],
      },
    });
    expect(res.body.error.requestId).toMatch(/^req-/);
    expect(res.text).not.toMatch(/secret\.ts|at \w|stack/i);
  });

  it('unknown route returns JSON 404 for /api and the SPA for other paths', async () => {
    const api = await request(app).get('/api/does-not-exist');
    expect(api.status).toBe(404);
    expect(api.headers['content-type']).toMatch(/application\/json/);
    expect(api.body.error).toMatchObject({ code: 'NOT_FOUND' });

    const spa = await request(app).get('/events/some-id/coverage');
    expect(spa.status).toBe(200);
    expect(spa.headers['content-type']).toMatch(/text\/html/);
    expect(spa.text).toContain('<div id="root">');
  });
});
