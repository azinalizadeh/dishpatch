import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { systemClock } from './clock.ts';
import { createDb } from './db/client.ts';
import { type Env, EnvError, loadEnv } from './env.ts';
import { createLogger } from './logger.ts';
import { createInProcessEventBus } from './realtime/event-bus.ts';

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
const staticDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
const bus = createInProcessEventBus();
const app = buildApp({ env, db, clock: systemClock, bus, logger, staticDir });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'api listening');
});
server.keepAliveTimeout = 65_000;

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    void db.sql.end({ timeout: 5 }).finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
