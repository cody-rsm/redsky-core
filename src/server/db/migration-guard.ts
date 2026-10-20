import type postgres from 'postgres';

export const REDSKY_SCHEMA = 'redsky';
export const REDSKY_MARKER = { key: 'app', value: 'redsky' } as const;

// Schemas a Twenty CRM database contains (core/metadata, plus one `workspace_*` schema per workspace).
const TWENTY_SCHEMA_PATTERN = /^(core|metadata|workspace_[a-z0-9]+)$/;
const SYSTEM_SCHEMAS = new Set(['pg_catalog', 'information_schema', 'pg_toast']);

export type GuardResult = { ok: true; fresh: boolean } | { ok: false; reason: string };

// Decides whether it is safe to apply RedSky migrations to the connected database. Refuses Twenty's database and
// any other application's database: the target must be empty or already carry RedSky's marker.
export async function checkMigrationTarget(sql: postgres.Sql): Promise<GuardResult> {
  const schemas = await sql<{ schema_name: string }[]>`select schema_name from information_schema.schemata`;
  const names = schemas.map((row) => row.schema_name).filter((name) => !SYSTEM_SCHEMAS.has(name) && !name.startsWith('pg_temp') && !name.startsWith('pg_toast_temp'));

  const twenty = names.filter((name) => TWENTY_SCHEMA_PATTERN.test(name));
  if (twenty.length > 0) {
    return { ok: false, reason: `This database contains Twenty CRM schemas (${twenty.slice(0, 3).join(', ')}). RedSky must use its own database (redsky-postgres).` };
  }

  const foreignTables = await sql<{ count: string }[]>`
    select count(*)::text as count from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema', ${REDSKY_SCHEMA})`;
  const hasForeignTables = Number(foreignTables[0]?.count ?? '0') > 0;

  const markerTable = await sql<{ exists: boolean }[]>`select to_regclass('redsky.meta') is not null as exists`;
  if (markerTable[0]?.exists) {
    const marker = await sql<{ value: string }[]>`select value from redsky.meta where key = ${REDSKY_MARKER.key}`;
    if (marker[0]?.value !== REDSKY_MARKER.value) return { ok: false, reason: 'The redsky schema exists but is not marked as a RedSky database.' };
    return { ok: true, fresh: false };
  }

  if (hasForeignTables) {
    return { ok: false, reason: 'This database already contains tables from another application. Point REDSKY_DATABASE_URL at an empty, dedicated database.' };
  }
  const redskyTables = await sql<{ count: string }[]>`select count(*)::text as count from information_schema.tables where table_schema = ${REDSKY_SCHEMA}`;
  if (Number(redskyTables[0]?.count ?? '0') > 0) return { ok: false, reason: 'The redsky schema has tables but no RedSky marker; refusing to migrate.' };
  return { ok: true, fresh: true };
}
