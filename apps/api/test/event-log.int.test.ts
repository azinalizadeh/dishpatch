import type { BoardEvent } from '@dishpatch/shared';
import { eq, lte } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { eventLog, events } from '../src/db/schema.ts';
import { createInProcessEventBus } from '../src/realtime/event-bus.ts';
import { createEventLogRepo, recordAndPublish } from '../src/realtime/event-log.ts';
import { clock, createBoard } from './helpers/boards.ts';
import { useTestDb } from './helpers/int-app.ts';

describe('event log', () => {
  const db = useTestDb();
  const repo = createEventLogRepo(db);

  /** Logs `n` lock/unlock changes through the real write path. */
  async function logChanges(eventId: string, n: number) {
    const bus = createInProcessEventBus();
    for (let i = 0; i < n; i++) {
      await recordAndPublish(db, bus, clock, async (_tx, record) => {
        await record(eventId, { type: 'event.updated', locked: i % 2 === 0 });
      });
    }
  }

  it('since returns events after seq in order', async () => {
    const { eventId } = await createBoard(db);
    await logChanges(eventId, 4);

    expect(await repo.since(eventId, 1)).toEqual([
      { type: 'event.updated', seq: 2, locked: false },
      { type: 'event.updated', seq: 3, locked: true },
      { type: 'event.updated', seq: 4, locked: false },
    ]);
    expect(await repo.since(eventId, 4)).toEqual([]);
  });

  it('since returns too_old when seq is older than the oldest retained row', async () => {
    const { eventId } = await createBoard(db);
    await logChanges(eventId, 4);
    // Retention cleanup removed seq 1–2.
    await db.orm.delete(eventLog).where(lte(eventLog.seq, 2));

    expect(await repo.since(eventId, 0)).toBe('too_old');
    expect(await repo.since(eventId, 1)).toBe('too_old');
    expect(await repo.since(eventId, 2)).toHaveLength(2);
    // A Last-Event-ID from the future can't be trusted either.
    expect(await repo.since(eventId, 9)).toBe('too_old');
  });

  it('since skips logged rows the stream does not carry instead of failing the replay', async () => {
    const { eventId } = await createBoard(db);
    await logChanges(eventId, 1);
    // A row the stream can't carry (here: a payload that doesn't parse).
    await db.orm.update(events).set({ seq: 2 }).where(eq(events.id, eventId));
    await db.orm
      .insert(eventLog)
      .values({ eventId, seq: 2, type: 'slot.claimed', payload: {}, createdAt: clock.now() });
    await logChanges(eventId, 1);

    expect(await repo.since(eventId, 0)).toEqual([
      { type: 'event.updated', seq: 1, locked: true },
      { type: 'event.updated', seq: 3, locked: true },
    ]);
  });

  it('nothing is published when the transaction rolls back', async () => {
    const { eventId } = await createBoard(db);
    const bus = createInProcessEventBus();
    const published: BoardEvent[] = [];
    bus.subscribe(eventId, (m) => published.push(m));

    await expect(
      recordAndPublish(db, bus, clock, async (_tx, record) => {
        await record(eventId, { type: 'event.updated', locked: true });
        throw new Error('boom after logging');
      }),
    ).rejects.toThrow('boom after logging');

    expect(published).toEqual([]);
    expect(await db.orm.select().from(eventLog)).toEqual([]);
    const [event] = await db.orm.select().from(events).where(eq(events.id, eventId));
    expect(event?.seq).toBe(0);

    // The happy path publishes once, after commit, with the new seq.
    await recordAndPublish(db, bus, clock, async (_tx, record) => {
      await record(eventId, { type: 'event.updated', locked: true });
    });
    expect(published).toEqual([{ type: 'event.updated', seq: 1, locked: true }]);
  });
});
