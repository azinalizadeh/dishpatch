import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

export interface Db {
  sql: Sql;
  orm: PostgresJsDatabase;
}

export function createDb(url: string): Db {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  return { sql, orm: drizzle(sql) };
}

export async function pingDb(db: Db): Promise<boolean> {
  try {
    await db.sql`select 1`;
    return true;
  } catch {
    return false;
  }
}
