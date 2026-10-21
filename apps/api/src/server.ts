import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { systemClock } from './clock.ts';
import { createDb } from './db/client.ts';
import { runMigrations } from './db/migrate.ts';
import { type Env, EnvError, loadEnv } from './env.ts';
import { startCleanup } from './jobs/cleanup.ts';
import { createLogger } from './logger.ts';
import { createInProcessEventBus } from './realtime/event-bus.ts';
import type { SseHub } from './realtime/sse-hub.ts';

function readEnv(): Env {
  try {
    return loadEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

const env = readEnv();
const logger = createLogger(env.LOG_LEVEL);
const db = createDb(env.DATABASE_URL);
// Single instance (04-architecture.md): apply committed migrations before taking traffic.
await runMigrations(db);
// In development Vite serves the SPA; only production serves the built files.
const staticDir =
  env.NODE_ENV === 'production'
    ? fileURLToPath(new URL('../../web/dist', import.meta.url))
    : undefined;
const bus = createInProcessEventBus((err) => logger.error({ err }, 'bus subscriber failed'));
let hub: SseHub | undefined;
const app = buildApp({
  env,
  db,
  clock: systemClock,
  bus,
  logger,
  staticDir,
  onHub: (h) => {
    hub = h;
  },
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'api listening');
});
server.keepAliveTimeout = 65_000;

// F6.3: once at boot, then every CLEANUP_INTERVAL_MINUTES.
const stopCleanup = startCleanup({
  db,
  clock: systemClock,
  bus,
  logger,
  intervalMinutes: env.CLEANUP_INTERVAL_MINUTES,
});

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  stopCleanup();
  server.close(() => {
    void db.sql.end({ timeout: 5 }).finally(() => process.exit(0));
  });
  // Open SSE streams never finish on their own: end them (EventSource reconnects to the next
  // instance) and drop idle keep-alive sockets, but let in-flight requests finish.
  hub?.closeAll();
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
