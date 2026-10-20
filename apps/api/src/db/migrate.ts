import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client.ts';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Applies the committed SQL migrations (idempotent; drizzle tracks applied ones). */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db.orm, { migrationsFolder: MIGRATIONS_FOLDER });
}
