import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.ts';
import { createInProcessEventBus } from '../src/realtime/event-bus.ts';
import { ORIGIN } from './helpers/requests.ts';
import { testApp } from './helpers/test-app.ts';

describe('app factory (smoke)', () => {
  it('buildApp returns an app without listening and answers /api/health', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('maps a malformed JSON body to 400 VALIDATION', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/__test/echo')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"oops"');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('refuses a foreign-origin POST before reading its body (T2)', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/__test/echo')
      .set('Origin', 'https://evil.example')
      .set('Content-Type', 'application/json')
      .send('{"oops"');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });

  it('maps a body over 16 KB to 413', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/__test/echo')
      .set('Origin', ORIGIN)
      .send({ big: 'x'.repeat(17 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects a form-encoded body with 415', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/__test/echo')
      .set('Origin', ORIGIN)
      .type('form')
      .send('a=1');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('DomainError carries status, code and details', () => {
    const err = new DomainError(409, 'SLOT_TAKEN', 'Taken.', { claimedBy: 'Jonah' });
    expect(err).toMatchObject({ status: 409, code: 'SLOT_TAKEN', details: { claimedBy: 'Jonah' } });
  });

  it('in-process bus keeps publishing when one subscriber throws', () => {
    const errors: unknown[] = [];
    const bus = createInProcessEventBus((err) => errors.push(err));
    const got: string[] = [];
    bus.subscribe('a', () => {
      throw new Error('socket gone');
    });
    bus.subscribe('a', (m) => got.push(m.type));
    expect(() => bus.publish('a', { type: 'resync' })).not.toThrow();
    expect(got).toEqual(['resync']);
    expect(errors).toHaveLength(1);
  });

  it('in-process bus delivers to subscribers of the same event only', () => {
    const bus = createInProcessEventBus();
    const got: string[] = [];
    const off = bus.subscribe('a', (m) => got.push(m.type));
    bus.subscribe('b', (m) => got.push(`b:${m.type}`));
    bus.publish('a', { type: 'resync' });
    off();
    bus.publish('a', { type: 'presence', count: 1 });
    expect(got).toEqual(['resync']);
  });
});
