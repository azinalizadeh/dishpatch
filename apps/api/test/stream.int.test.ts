import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInProcessEventBus } from '../src/realtime/event-bus.ts';
import { createBoard } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { useSseServer } from './helpers/sse.ts';

describe('GET /api/events/:eventId/stream', () => {
  const db = useTestDb();
  let bus = createInProcessEventBus();
  let app = intApp(db, { bus }).app;
  const connect = useSseServer(() => app);

  const fresh = (overrides: Parameters<typeof intApp>[1] = {}) => {
    bus = createInProcessEventBus();
    app = intApp(db, { bus, ...overrides }).app;
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends retry and a presence event on connect', async () => {
    fresh();
    const board = await createBoard(db);
    const stream = await connect(`/api/events/${board.eventId}/stream`, {
      cookie: board.sessionToken,
    });

    expect(stream.status).toBe(200);
    const frames = await stream.until((f) => f.some((x) => x.event === 'presence'));
    expect(frames[0]).toEqual({ retry: '3000' });
    expect(frames.find((x) => x.event === 'presence')?.data).toBe(
      JSON.stringify({ type: 'presence', count: 1 }),
    );
  });

  it('sends the proxy-friendly SSE headers', async () => {
    fresh();
    const board = await createBoard(db);
    const stream = await connect(`/api/events/${board.eventId}/stream`, {
      cookie: board.sessionToken,
    });
    const res = stream.headers;
    expect(res.get('content-type')).toMatch(/^text\/event-stream/);
    expect(res.get('cache-control')).toContain('no-cache');
    expect(res.get('x-accel-buffering')).toBe('no');
  });

  it('stream for event B with a session of event A returns 404', async () => {
    fresh();
    const a = await createBoard(db);
    const b = await createBoard(db);
    const stream = await connect(`/api/events/${b.eventId}/stream`, { cookie: a.sessionToken });
    expect(stream.status).toBe(404);
    expect(JSON.parse(stream.body)).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const anonymous = await connect(`/api/events/${b.eventId}/stream`);
    expect(anonymous.status).toBe(404);
  });

  it('6th concurrent stream for one session returns 429 TOO_MANY_STREAMS', async () => {
    fresh();
    const board = await createBoard(db);
    const path = `/api/events/${board.eventId}/stream`;
    for (let i = 0; i < 5; i++) {
      const ok = await connect(path, { cookie: board.sessionToken });
      expect(ok.status).toBe(200);
    }
    const sixth = await connect(path, { cookie: board.sessionToken });
    expect(sixth.status).toBe(429);
    expect(JSON.parse(sixth.body)).toMatchObject({ error: { code: 'TOO_MANY_STREAMS' } });
  });

  it('caps streams per IP across sessions', async () => {
    fresh({ sse: { maxPerIp: 2 } });
    const a = await createBoard(db);
    const b = await createBoard(db);
    expect(
      (await connect(`/api/events/${a.eventId}/stream`, { cookie: a.sessionToken })).status,
    ).toBe(200);
    expect(
      (await connect(`/api/events/${b.eventId}/stream`, { cookie: b.sessionToken })).status,
    ).toBe(200);
    expect(
      (await connect(`/api/events/${b.eventId}/stream`, { cookie: b.sessionToken })).status,
    ).toBe(429);
  });

  it('sends heartbeat comment within 21 s (fake timers)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fresh();
    const board = await createBoard(db);
    const stream = await connect(`/api/events/${board.eventId}/stream`, {
      cookie: board.sessionToken,
    });
    await stream.until((f) => f.some((x) => x.event === 'presence'));
    expect(stream.frames().some((x) => x.comment === 'ping')).toBe(false);

    vi.advanceTimersByTime(21_000);
    await stream.until((f) => f.some((x) => x.comment === 'ping'));
  });

  it('delivers published board events with id: seq', async () => {
    fresh();
    const board = await createBoard(db);
    const stream = await connect(`/api/events/${board.eventId}/stream`, {
      cookie: board.sessionToken,
    });
    await stream.until((f) => f.some((x) => x.event === 'presence'));

    bus.publish(board.eventId, { type: 'event.updated', seq: 1, locked: true });
    const frames = await stream.until((f) => f.some((x) => x.event === 'event.updated'));
    expect(frames.find((x) => x.event === 'event.updated')).toMatchObject({ id: '1' });
  });

  it('closes all streams with event.deleted when the board is deleted', async () => {
    fresh();
    const board = await createBoard(db);
    const path = `/api/events/${board.eventId}/stream`;
    const one = await connect(path, { cookie: board.sessionToken });
    const two = await connect(path, { cookie: board.sessionToken });
    await one.until((f) => f.some((x) => x.event === 'presence'));
    await two.until((f) => f.some((x) => x.event === 'presence'));

    // M6's delete endpoint publishes this after its commit.
    bus.publish(board.eventId, { type: 'event.deleted' });

    await Promise.all([one.ended, two.ended]);
    for (const s of [one, two]) {
      expect(s.frames().at(-1)).toMatchObject({ event: 'event.deleted' });
    }
  });
});
