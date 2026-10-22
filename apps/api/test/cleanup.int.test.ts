import { Writable } from 'node:stream';
import type { BoardEvent } from '@dishpatch/shared';
import { count, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { eventLog, events, participants, sessions, slots } from '../src/db/schema.ts';
import { runCleanup, startCleanup } from '../src/jobs/cleanup.ts';
import { createLogger } from '../src/logger.ts';
import { createInProcessEventBus } from '../src/realtime/event-bus.ts';
import { afterExpiry, createBoard, joinGuest } from './helpers/boards.ts';
import { useTestDb } from './helpers/int-app.ts';
import { fixedClock } from './helpers/test-app.ts';

describe('cleanup job', () => {
  const db = useTestDb();

  const rowsFor = async (eventId: string) => {
    const counts = await Promise.all([
      db.orm.select({ n: count() }).from(events).where(eq(events.id, eventId)),
      db.orm.select({ n: count() }).from(participants).where(eq(participants.eventId, eventId)),
      db.orm
        .select({ n: count() })
        .from(sessions)
        .innerJoin(participants, eq(participants.id, sessions.participantId))
        .where(eq(participants.eventId, eventId)),
      db.orm.select({ n: count() }).from(slots).where(eq(slots.eventId, eventId)),
    ]);
    return counts.map(([row]) => row?.n);
  };

  it('deletes events 14 days after starts_at with all participants', async () => {
    // Starts 21 Nov 17:00 UTC, so it expires 5 Dec 17:00 UTC; afterExpiry is 6 Dec.
    const board = await createBoard(db);
    await joinGuest(db, board, 'Reza', ['halal']);
    const bus = createInProcessEventBus();
    const published: BoardEvent[] = [];
    bus.subscribe(board.eventId, (m) => published.push(m));

    const result = await runCleanup(db, afterExpiry, bus);

    expect(result.events).toBe(1);
    expect(await rowsFor(board.eventId)).toEqual([0, 0, 0, 0]);
    expect(published).toEqual([{ type: 'event.deleted' }]);
  });

  it('keeps events that expire tomorrow', async () => {
    const board = await createBoard(db);
    await joinGuest(db, board, 'Reza');

    const result = await runCleanup(
      db,
      fixedClock('2026-12-04T17:00:00Z'),
      createInProcessEventBus(),
    );

    expect(result.events).toBe(0);
    expect(await rowsFor(board.eventId)).toEqual([1, 2, 2, 12]);
  });

  it('prunes event_log rows older than 24 h', async () => {
    const board = await createBoard(db);
    // Joined at the helpers' clock (20 Oct 12:00 UTC): one participant.joined row.
    await joinGuest(db, board, 'Reza');
    await db.orm.insert(eventLog).values({
      eventId: board.eventId,
      seq: 2,
      type: 'event.updated',
      payload: { locked: true },
      createdAt: new Date('2026-10-21T11:00:00Z'),
    });

    const result = await runCleanup(
      db,
      fixedClock('2026-10-21T13:00:00Z'),
      createInProcessEventBus(),
    );

    expect(result).toEqual({ events: 0, logRows: 1 });
    const left = await db.orm
      .select({ seq: eventLog.seq })
      .from(eventLog)
      .where(eq(eventLog.eventId, board.eventId));
    expect(left).toEqual([{ seq: 2 }]);
  });

  it('runs once at boot and logs counts only', async () => {
    const board = await createBoard(db);
    await joinGuest(db, board, 'Reza', ['nut_free']);
    const chunks: string[] = [];
    const logger = createLogger(
      'info',
      new Writable({
        write(chunk, _encoding, done) {
          chunks.push(String(chunk));
          done();
        },
      }),
    );

    const stop = startCleanup({
      db,
      clock: afterExpiry,
      bus: createInProcessEventBus(),
      logger,
      intervalMinutes: 60,
    });
    await vi.waitFor(() => expect(chunks.join('')).toContain('cleanup finished'));
    stop();

    const line = JSON.parse(chunks.find((c) => c.includes('cleanup finished')) ?? '{}');
    // The board's own log rows went with it (cascade), so none are left to prune separately.
    expect(line).toMatchObject({ events: 1, logRows: 0 });
    const text = chunks.join('');
    for (const secret of [board.eventId, 'Reza', 'nut_free', 'Friendsgiving']) {
      expect(text).not.toContain(secret);
    }
  });
});
