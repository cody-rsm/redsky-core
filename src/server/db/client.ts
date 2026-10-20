import 'server-only';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getConfig } from '@/server/config/env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

type DatabaseHandle = { db: Database; sql: postgres.Sql };

// One pool per process. In development Next re-evaluates modules on every edit, so the handle is kept on
// globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { redskyDb?: DatabaseHandle };

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('REDSKY_DATABASE_URL is not configured');
  }
}

function createHandle(): DatabaseHandle {
  const url = getConfig().databaseUrl;
  if (!url) throw new DatabaseNotConfiguredError();
  const sql = postgres(url, { max: 10, idle_timeout: 30, connect_timeout: 10, prepare: true, onnotice: () => {} });
  return { db: drizzle(sql, { schema }), sql };
}

export function getDb(): Database {
  if (!globalForDb.redskyDb) globalForDb.redskyDb = createHandle();
  return globalForDb.redskyDb.db;
}

export async function pingDatabase(): Promise<'ok' | 'error' | 'unconfigured'> {
  if (!getConfig().databaseUrl) return 'unconfigured';
  try {
    if (!globalForDb.redskyDb) globalForDb.redskyDb = createHandle();
    await globalForDb.redskyDb.sql`select 1`;
    return 'ok';
  } catch {
    return 'error';
  }
}
