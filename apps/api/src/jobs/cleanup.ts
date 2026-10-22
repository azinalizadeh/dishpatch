import { lt } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { eventLog, events } from '../db/schema.ts';
import type { EventBus } from '../realtime/event-bus.ts';

/** Replay only needs recent history; older rows make a reconnecting client resync instead. */
const LOG_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  events: number;
  logRows: number;
}

/**
 * Deletes expired boards (14 days after the party; the foreign keys cascade to participants,
 * sessions, slots and log rows) and event-log rows older than 24 h (07-security.md › Privacy).
 * Anyone still viewing an expired board is told it's gone, as after a host delete. The two
 * deletes are independent (each is safe on its own), so they don't share a transaction.
 */
export async function runCleanup(db: Db, clock: Clock, bus: EventBus): Promise<CleanupResult> {
  const now = clock.now();
  const expired = await db.orm
    .delete(events)
    .where(lt(events.expiresAt, now))
    .returning({ id: events.id });
  const pruned = await db.orm
    .delete(eventLog)
    .where(lt(eventLog.createdAt, new Date(now.getTime() - LOG_RETENTION_MS)));
  for (const { id } of expired) bus.publish(id, { type: 'event.deleted' });
  return { events: expired.length, logRows: pruned.count };
}

/** Runs the cleanup once now, then every `intervalMinutes`. Logs counts only, never content. */
export function startCleanup({
  db,
  clock,
  bus,
  logger,
  intervalMinutes,
}: {
  db: Db;
  clock: Clock;
  bus: EventBus;
  logger: Logger;
  intervalMinutes: number;
}): () => void {
  const run = () =>
    runCleanup(db, clock, bus).then(
      (result) => logger.info(result, 'cleanup finished'),
      (err: unknown) => logger.error({ err }, 'cleanup failed'),
    );
  void run();
  const timer = setInterval(run, intervalMinutes * 60_000);
  // The timer alone must not keep the process alive at shutdown.
  timer.unref();
  return () => clearInterval(timer);
}
