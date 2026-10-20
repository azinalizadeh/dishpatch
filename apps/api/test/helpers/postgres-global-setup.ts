import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { createDb } from '../../src/db/client.ts';
import { runMigrations } from '../../src/db/migrate.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Admin connection to the container (the `postgres` database). */
    databaseUrl: string;
    /** Migrated database each test file clones with CREATE DATABASE … TEMPLATE. */
    templateDatabase: string;
  }
}

export const TEMPLATE_DATABASE = 'dishpatch_template';

let container: StartedPostgreSqlContainer | undefined;

export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** One Postgres 18.6 container per Vitest run; migrations applied once (06-test-plan.md › DB isolation). */
export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  const adminUrl = withDatabase(container.getConnectionUri(), 'postgres');

  const admin = createDb(adminUrl);
  await admin.sql`create database ${admin.sql(TEMPLATE_DATABASE)}`;
  await admin.sql.end({ timeout: 5 });

  const template = createDb(withDatabase(adminUrl, TEMPLATE_DATABASE));
  await runMigrations(template);
  await template.sql.end({ timeout: 5 });

  project.provide('databaseUrl', adminUrl);
  project.provide('templateDatabase', TEMPLATE_DATABASE);
}

export async function teardown() {
  await container?.stop();
}
