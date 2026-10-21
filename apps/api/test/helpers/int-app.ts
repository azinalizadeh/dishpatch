import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import type { AppDeps } from '../../src/app.ts';
import { createDb, type Db } from '../../src/db/client.ts';
import { withDatabase } from './postgres-global-setup.ts';
import { testApp } from './test-app.ts';

/**
 * A migrated database of this test file's own, cloned from the run's template, so files can run
 * in parallel. Every table is truncated before each test.
 */
export function useTestDb(): Db {
  const adminUrl = inject('databaseUrl');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const db = createDb(withDatabase(adminUrl, name));

  beforeAll(async () => {
    const admin = createDb(adminUrl);
    try {
      await admin.sql`create database ${admin.sql(name)} template ${admin.sql(inject('templateDatabase'))}`;
    } finally {
      await admin.sql.end({ timeout: 5 });
    }
  });
  beforeEach(async () => {
    await db.sql`truncate events, participants, sessions, slots, event_log restart identity cascade`;
  });
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

export function intApp(db: Db, overrides: Partial<AppDeps> = {}) {
  return testApp({ db, staticDir: fakeSpaDir(), ...overrides });
}
