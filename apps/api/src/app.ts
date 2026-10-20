import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import type { Clock } from './clock.ts';
import type { Db } from './db/client.ts';
import type { Env } from './env.ts';
import { createHttpLogger, createLogger } from './logger.ts';
import { errorHandler, notFoundHandler } from './middleware/errors.ts';
import { noStore, requireJsonBody, securityHeaders } from './middleware/security.ts';
import type { EventBus } from './realtime/event-bus.ts';
import { healthRouter } from './routes/health.ts';
import { testOnlyRouter } from './routes/test-only.ts';

export interface AppDeps {
  env: Env;
  db: Db;
  clock: Clock;
  bus: EventBus;
  logger?: Logger;
  /** Built SPA (apps/web/dist). Served with an index.html fallback for non-/api GETs when present. */
  staticDir?: string;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function buildApp(deps: AppDeps): Express {
  const { env, db } = deps;
  const logger = deps.logger ?? createLogger(env.LOG_LEVEL);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(createHttpLogger(logger));
  app.use(securityHeaders({ production: env.NODE_ENV === 'production' }));

  const api = express.Router();
  api.use(noStore);
  api.use(requireJsonBody);
  api.use(express.json({ limit: '16kb' }));
  api.use(cookieParser());
  api.use(healthRouter(db));
  if (env.NODE_ENV === 'test') api.use(testOnlyRouter());
  api.use(notFoundHandler);
  app.use('/api', api);

  const staticDir = deps.staticDir;
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false }));
    app.get('/{*splat}', (req, res, next) => {
      // A missing hashed asset is a real 404, not the SPA.
      if (req.path.startsWith('/assets/')) return next();
      res.sendFile(join(staticDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
