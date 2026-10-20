import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** One Postgres 18.6 container per Vitest run (06-test-plan.md › DB isolation). */
export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  project.provide('databaseUrl', container.getConnectionUri());
}

export async function teardown() {
  await container?.stop();
}
