import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, inject } from 'vitest';
import { createDb, type Db } from '../../src/db/client.ts';
import { testApp } from './test-app.ts';

/** A real Postgres connection to the run's Testcontainers database, closed after the file. */
export function useTestDb(): Db {
  const db = createDb(inject('databaseUrl'));
  afterAll(() => db.sql.end({ timeout: 5 }));
  return db;
}

/** A throwaway built-SPA folder so tests can check the index.html fallback. */
export function fakeSpaDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dishpatch-spa-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><head><title>Dishpatch</title></head><body><div id="root"></div></body></html>',
  );
  return dir;
}

export function intApp(db: Db) {
  return testApp({ db, staticDir: fakeSpaDir() });
}
