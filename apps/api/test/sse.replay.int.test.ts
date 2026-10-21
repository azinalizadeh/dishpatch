import { lte } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { eventLog } from '../src/db/schema.ts';
import { createInProcessEventBus } from '../src/realtime/event-bus.ts';
import { recordAndPublish } from '../src/realtime/event-log.ts';
import { clock, createBoard } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { useSseServer } from './helpers/sse.ts';

describe('SSE replay', () => {
  const db = useTestDb();
  const bus = createInProcessEventBus();
  const { app } = intApp(db, { bus });
  const connect = useSseServer(() => app);

  async function lockToggles(eventId: string, n: number) {
    for (let i = 0; i < n; i++) {
      await recordAndPublish(db, bus, clock, async (_tx, record) => {
        await record(eventId, { type: 'event.updated', locked: i % 2 === 0 });
      });
    }
  }

  it('reconnect with Last-Event-ID replays missed events in seq order', async () => {
    const board = await createBoard(db);
    await lockToggles(board.eventId, 5);

    const stream = await connect(`/api/events/${board.eventId}/stream`, {
      cookie: board.sessionToken,
      headers: { 'Last-Event-ID': '2' },
    });
    const frames = await stream.until(
      (f) => f.filter((x) => x.event === 'event.updated').length === 3,
    );
    expect(frames.filter((x) => x.event === 'event.updated').map((x) => x.id)).toEqual([
      '3',
      '4',
      '5',
    ]);

    // Live events continue after the replay, and a duplicate of a replayed seq is dropped.
    bus.publish(board.eventId, { type: 'event.updated', seq: 5, locked: true });
    await lockToggles(board.eventId, 1);
    const after = await stream.until((f) => f.some((x) => x.id === '6'));
    expect(after.filter((x) => x.event === 'event.updated').map((x) => x.id)).toEqual([
      '3',
      '4',
      '5',
      '6',
    ]);
  });

  it('first connect resumes from ?after= (the snapshot seq)', async () => {
    const board = await createBoard(db);
    await lockToggles(board.eventId, 3);
    const stream = await connect(`/api/events/${board.eventId}/stream?after=1`, {
      cookie: board.sessionToken,
    });
    const frames = await stream.until((f) => f.some((x) => x.id === '3'));
    expect(frames.filter((x) => x.id).map((x) => x.id)).toEqual(['2', '3']);
  });

  it('fills a gap from the log when live events arrive out of order', async () => {
    const board = await createBoard(db);
    await lockToggles(board.eventId, 1);
    const stream = await connect(`/api/events/${board.eventId}/stream?after=1`, {
      cookie: board.sessionToken,
    });
    await stream.until((f) => f.some((x) => x.event === 'presence'));

    // Two commits whose publishes reach the bus as 3, then 2.
    const quiet = createInProcessEventBus();
    for (const locked of [true, false]) {
      await recordAndPublish(db, quiet, clock, async (_tx, record) => {
        await record(board.eventId, { type: 'event.updated', locked });
      });
    }
    bus.publish(board.eventId, { type: 'event.updated', seq: 3, locked: false });
    bus.publish(board.eventId, { type: 'event.updated', seq: 2, locked: true });

    const frames = await stream.until((f) => f.some((x) => x.id === '3'));
    expect(frames.filter((x) => x.id).map((x) => x.id)).toEqual(['2', '3']);
  });

  it('sends resync when Last-Event-ID is older than retention', async () => {
    const board = await createBoard(db);
    await lockToggles(board.eventId, 4);
    await db.orm.delete(eventLog).where(lte(eventLog.seq, 2));

    const stream = await connect(`/api/events/${board.eventId}/stream`, {
      cookie: board.sessionToken,
      headers: { 'Last-Event-ID': '1' },
    });
    await stream.ended;
    const frames = stream.frames();
    expect(frames.at(-1)).toMatchObject({ event: 'resync' });
    expect(frames.some((x) => x.event === 'event.updated')).toBe(false);
  });
});
