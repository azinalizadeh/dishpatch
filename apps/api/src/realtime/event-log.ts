import { SequencedBoardEvent } from '@dishpatch/shared';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { eventLog, events } from '../db/schema.ts';
import type { EventBus } from './event-bus.ts';

type Tx = Parameters<Parameters<Db['orm']['transaction']>[0]>[0];

/** A sequenced change before it has a `seq`: `record` assigns the next one. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type UnsequencedChange = DistributiveOmit<SequencedBoardEvent, 'seq'>;

export type RecordChange = (
  eventId: string,
  change: UnsequencedChange,
) => Promise<SequencedBoardEvent>;

/**
 * Runs one board mutation (04-architecture.md › Write path). Inside `work`, `record` bumps
 * `events.seq` and writes the `event_log` row in the same transaction; the recorded events are
 * published only after COMMIT, so a rollback publishes nothing. The caller must have locked the
 * event row (`SELECT … FOR UPDATE`) before calling `record`.
 */
export async function recordAndPublish<T>(
  db: Db,
  bus: EventBus,
  clock: Clock,
  work: (tx: Tx, record: RecordChange) => Promise<T>,
): Promise<T> {
  const outbox: { eventId: string; msg: SequencedBoardEvent }[] = [];

  const result = await db.orm.transaction(async (tx) => {
    const record: RecordChange = async (eventId, change) => {
      const [row] = await tx
        .update(events)
        .set({ seq: sql`${events.seq} + 1` })
        .where(eq(events.id, eventId))
        .returning({ seq: events.seq });
      if (!row) throw new Error('record: event row not found');
      const { type, ...payload } = change;
      await tx
        .insert(eventLog)
        .values({ eventId, seq: row.seq, type, payload, createdAt: clock.now() });
      const msg = { ...change, seq: row.seq } as SequencedBoardEvent;
      outbox.push({ eventId, msg });
      return msg;
    };
    return work(tx, record);
  });

  for (const { eventId, msg } of outbox) bus.publish(eventId, msg);
  return result;
}

export interface EventLogRepo {
  /**
   * Logged events with `seq > afterSeq`, in order, for SSE replay; `'too_old'` when the client's
   * position can't be bridged (rows already cleaned up, or a seq the board never reached).
   */
  since(eventId: string, afterSeq: number): Promise<SequencedBoardEvent[] | 'too_old'>;
}

export function createEventLogRepo(db: Db): EventLogRepo {
  return {
    async since(eventId, afterSeq) {
      return db.orm.transaction(
        async (tx) => {
          const [event] = await tx
            .select({ seq: events.seq })
            .from(events)
            .where(eq(events.id, eventId));
          if (!event || afterSeq > event.seq) return 'too_old';
          if (afterSeq === event.seq) return [];

          const rows = await tx
            .select({ seq: eventLog.seq, type: eventLog.type, payload: eventLog.payload })
            .from(eventLog)
            .where(and(eq(eventLog.eventId, eventId), gt(eventLog.seq, afterSeq)))
            .orderBy(asc(eventLog.seq));
          if (rows[0]?.seq !== afterSeq + 1) return 'too_old';
          // Rows the stream doesn't carry (e.g. `invite.rotated`) are skipped, not fatal: one odd
          // row must never block replay for the whole board.
          return rows.flatMap(({ seq, type, payload }) => {
            const parsed = SequencedBoardEvent.safeParse({ ...(payload as object), type, seq });
            return parsed.success ? [parsed.data] : [];
          });
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
  };
}
