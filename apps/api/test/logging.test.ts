import { setImmediate as tick } from 'node:timers/promises';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { redactPath } from '../src/logger.ts';
import { ORIGIN } from './helpers/requests.ts';
import { testApp } from './helpers/test-app.ts';

const TOKEN = 'Zk3q9cW1pXe7Lr0tYb2nVa8uHs4dJm6oGf5iKc1wQyE';

describe('request logging', () => {
  it('redacts invite and host tokens from request logs', async () => {
    const { app, logs } = testApp();
    await request(app).get(`/e/${TOKEN}`);
    await request(app).get(`/h/${TOKEN}`);
    await request(app).get(`/api/invites/${TOKEN}`);
    await request(app).post(`/api/host-links/${TOKEN}/session`);
    await tick();

    const out = logs.lines();
    expect(out).toContain('/e/:token');
    expect(out).toContain('/h/:token');
    expect(out).toContain('/api/invites/:token');
    expect(out).toContain('/api/host-links/:token/session');
    expect(out).not.toContain(TOKEN);
  });

  it('does not log request bodies', async () => {
    const { app, logs } = testApp();
    await request(app)
      .post(`/api/invites/${TOKEN}/join`)
      .send({ displayName: 'Priya Ramaswamy', dietaryNeeds: ['halal', 'gluten_free'] });
    await request(app)
      .post('/api/__test/echo')
      .set('Origin', ORIGIN)
      .send({ displayName: 'Priya Ramaswamy' });
    await tick();

    const out = logs.lines();
    expect(out).toContain('/api/__test/echo');
    expect(out).not.toContain('Priya');
    expect(out).not.toContain('halal');
    expect(out).not.toContain('gluten_free');
  });

  it('redacts cookie and set-cookie headers', async () => {
    const { app, logs } = testApp();
    await request(app).get('/api/health').set('Cookie', 'dp_sess=cookie-secret-value');
    const res = await request(app).get('/api/__test/set-cookie');
    await tick();

    expect(res.headers['set-cookie']?.[0]).toContain('set-cookie-secret-value');
    const out = logs.lines();
    expect(out).not.toContain('cookie-secret-value');
    expect(out).not.toContain('set-cookie-secret-value');
  });

  it('strips the query string and leaves other paths alone', () => {
    expect(redactPath('/api/health?x=1')).toBe('/api/health');
    expect(redactPath('/events/123')).toBe('/events/123');
  });

  it('logs board and slot ids as :id', () => {
    const board = '3f2b8c1e-9a4d-4e7f-8b6a-1c2d3e4f5a6b';
    const slot = 'A1B2C3D4-E5F6-4a7b-8c9d-0e1f2a3b4c5d';
    expect(redactPath(`/api/events/${board}/slots/${slot}/claim`)).toBe(
      '/api/events/:id/slots/:id/claim',
    );
  });

  it('logs a refused request at warn with its error code (A09)', async () => {
    const { app, logs } = testApp();
    await request(app).post('/api/__test/echo').set('Origin', 'https://evil.example').send({});
    await tick();

    const line = logs
      .lines()
      .split('\n')
      .find((l) => l.includes('/api/__test/echo'));
    expect(line).toBeDefined();
    expect(JSON.parse(line ?? '{}')).toMatchObject({ level: 40, code: 'BAD_ORIGIN' });
  });
});
