// Applies RedSky's SQL migrations (./drizzle) to the RedSky database — and only to it.
// Usage: REDSKY_DATABASE_URL=postgres://... node dist/migrate.mjs   (or `npm run db:migrate` in development)
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { checkMigrationTarget, REDSKY_MARKER, REDSKY_SCHEMA } from '../src/server/db/migration-guard';

// Arbitrary constant: serializes concurrent deploys so only one process migrates at a time.
const MIGRATION_LOCK_ID = 7_242_031_001;

function log(level: 'info' | 'error', message: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, time: new Date().toISOString(), component: 'migrate', message, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}

async function main(): Promise<number> {
  const url = process.env.REDSKY_DATABASE_URL;
  if (!url) {
    log('error', 'REDSKY_DATABASE_URL is not set; nothing was migrated');
    return 1;
  }
  const target = new URL(url);
  const database = target.pathname.replace(/^\//, '') || '(default)';
  const migrationsFolder = path.resolve(process.env.REDSKY_MIGRATIONS_DIR ?? 'drizzle');
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 15 });
  try {
    await sql`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    const guard = await checkMigrationTarget(sql);
    if (!guard.ok) {
      log('error', 'Refusing to migrate', { database, reason: guard.reason });
      return 2;
    }
    log('info', guard.fresh ? 'Initializing an empty RedSky database' : 'Migrating RedSky database', { database });
    await migrate(drizzle(sql), { migrationsFolder, migrationsSchema: REDSKY_SCHEMA, migrationsTable: '__migrations' });
    await sql`insert into redsky.meta (key, value) values (${REDSKY_MARKER.key}, ${REDSKY_MARKER.value}) on conflict (key) do nothing`;
    await sql`insert into redsky.meta (key, value) values ('migrated_at', ${new Date().toISOString()}) on conflict (key) do update set value = excluded.value`;
    const applied = await sql<{ count: string }[]>`select count(*)::text as count from redsky.__migrations`;
    log('info', 'Migrations complete', { database, applied: Number(applied[0]?.count ?? 0) });
    return 0;
  } catch (error) {
    log('error', 'Migration failed', { database, error: error instanceof Error ? error.message : String(error) });
    return 1;
  } finally {
    await sql`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`.catch(() => undefined);
    await sql.end({ timeout: 5 });
  }
}

main().then((code) => process.exit(code));
