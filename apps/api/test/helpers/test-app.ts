import { Writable } from 'node:stream';
import type { Express } from 'express';
import { type AppDeps, buildApp } from '../../src/app.ts';
import type { Clock } from '../../src/clock.ts';
import type { Db } from '../../src/db/client.ts';
import { type Env, loadEnv } from '../../src/env.ts';
import { createLogger } from '../../src/logger.ts';
import { createInProcessEventBus } from '../../src/realtime/event-bus.ts';

export function testEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    APP_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'info',
    ...overrides,
  });
}

export const fixedClock = (iso = '2026-11-20T12:00:00Z'): Clock => ({ now: () => new Date(iso) });

/** A Db stand-in for unit tests that never touch Postgres; every query resolves to no rows. */
export function fakeDb(): Db {
  const sql = Object.assign(async () => [], { end: async () => {} });
  return { sql, orm: {} } as unknown as Db;
}

export interface LogCapture {
  lines: () => string;
}

export function testApp(overrides: Partial<AppDeps> = {}): { app: Express; logs: LogCapture } {
  const chunks: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  const env = overrides.env ?? testEnv();
  const app = buildApp({
    env,
    db: fakeDb(),
    clock: fixedClock(),
    bus: createInProcessEventBus(),
    logger: createLogger('info', destination),
    ...overrides,
  });
  return { app, logs: { lines: () => chunks.join('') } };
}
