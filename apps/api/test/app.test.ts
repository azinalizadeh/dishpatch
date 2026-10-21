import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.ts';
import { createInProcessEventBus } from '../src/realtime/event-bus.ts';
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
      .set('Content-Type', 'application/json')
      .send('{"oops"');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('maps a body over 16 KB to 413', async () => {
    const { app } = testApp();
    const res = await request(app)
      .post('/api/__test/echo')
      .send({ big: 'x'.repeat(17 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects a form-encoded body with 415', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/__test/echo').type('form').send('a=1');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('DomainError carries status, code and details', () => {
    const err = new DomainError(409, 'SLOT_TAKEN', 'Taken.', { claimedBy: 'Jonah' });
    expect(err).toMatchObject({ status: 409, code: 'SLOT_TAKEN', details: { claimedBy: 'Jonah' } });
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
