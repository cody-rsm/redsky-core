import type postgres from 'postgres';
import { REDSKY_SCHEMA } from '@/server/db/migration-guard';
import { decryptBytes, decryptString, encryptBytes, encryptString } from './crypto';
import { crmTokenContext, workstyleContext } from './encryption-contexts';

// Re-encrypts every column protected by REDSKY_ENCRYPTION_KEY after the key changes (docs/DEPLOYMENT.md §12).
// Rows that already decrypt with the primary key are left alone, so a run can be interrupted and repeated.

export type RotationKeys = { primary: Buffer; fallback: Buffer };
export type RotationRow = { user_id: string; provider?: string } & Record<string, unknown>;

type EncryptedColumn = { name: string; kind: 'string' | 'bytes'; context: (row: RotationRow) => string };
export type EncryptedTable = { table: string; keyColumns: string[]; columns: EncryptedColumn[] };

export const ENCRYPTED_TABLES: EncryptedTable[] = [
  {
    table: 'workstyle_assessments',
    keyColumns: ['user_id'],
    columns: [
      { name: 'source_name_ciphertext', kind: 'string', context: (row) => workstyleContext(row.user_id, 'name') },
      { name: 'draft_ciphertext', kind: 'string', context: (row) => workstyleContext(row.user_id, 'draft') },
      { name: 'profile_ciphertext', kind: 'string', context: (row) => workstyleContext(row.user_id, 'profile') },
    ],
  },
  {
    table: 'workstyle_documents',
    keyColumns: ['user_id'],
    columns: [{ name: 'ciphertext', kind: 'bytes', context: (row) => workstyleContext(row.user_id, 'document') }],
  },
  {
    table: 'crm_connections',
    keyColumns: ['user_id', 'provider'],
    columns: [
      { name: 'refresh_token_ciphertext', kind: 'string', context: (row) => crmTokenContext(String(row.provider), row.user_id, 'refresh') },
      { name: 'access_token_ciphertext', kind: 'string', context: (row) => crmTokenContext(String(row.provider), row.user_id, 'access') },
    ],
  },
];

export type RowPlan =
  // Every encrypted value already reads with the primary key.
  | { status: 'current' }
  // The new ciphertexts to write, by column (values still under the fallback key).
  | { status: 'rewrite'; updates: Record<string, string | Buffer> }
  | { status: 'failed'; column: string };

function readsWith(column: EncryptedColumn, value: string | Buffer, key: Buffer, context: string): { ok: true; plaintext: string | Buffer } | { ok: false } {
  try {
    return { ok: true, plaintext: column.kind === 'bytes' ? decryptBytes(value as Buffer, key, context) : decryptString(value as string, key, context) };
  } catch {
    return { ok: false };
  }
}

// Decides what to do with one row without touching the database. Plaintext never leaves this function.
export function planRow(table: EncryptedTable, row: RotationRow, keys: RotationKeys): RowPlan {
  const updates: Record<string, string | Buffer> = {};
  for (const column of table.columns) {
    const value = row[column.name];
    if (value === null || value === undefined) continue;
    const context = column.context(row);
    if (readsWith(column, value as string | Buffer, keys.primary, context).ok) continue;
    const fallback = readsWith(column, value as string | Buffer, keys.fallback, context);
    if (!fallback.ok) return { status: 'failed', column: column.name };
    updates[column.name] = column.kind === 'bytes' ? encryptBytes(fallback.plaintext as Buffer, keys.primary, context) : encryptString(fallback.plaintext as string, keys.primary, context);
  }
  return Object.keys(updates).length === 0 ? { status: 'current' } : { status: 'rewrite', updates };
}

export type TableSummary = {
  // Rows already under the primary key.
  current: number;
  // Rows rewritten in this run (always 0 in a dry run).
  rotated: number;
  // Rows still under the fallback key: all of them in a dry run; otherwise rows that changed while being rotated.
  remaining: number;
  // Rows that decrypt with neither key.
  failed: number;
};
export type RotationSummary = { tables: Record<string, TableSummary>; totals: TableSummary; durationMs: number };

export type RotationLog = (level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>) => void;
export type RotationOptions = { keys: RotationKeys; dryRun: boolean; batchSize?: number; tables?: EncryptedTable[]; log?: RotationLog };

const DEFAULT_BATCH_SIZE = 200;

function add(into: TableSummary, from: TableSummary): void {
  into.current += from.current;
  into.rotated += from.rotated;
  into.remaining += from.remaining;
  into.failed += from.failed;
}

export async function rotateEncryptionKey(sql: postgres.Sql, options: RotationOptions): Promise<RotationSummary> {
  const started = Date.now();
  const log: RotationLog = options.log ?? (() => undefined);
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const tables: Record<string, TableSummary> = {};
  const totals: TableSummary = { current: 0, rotated: 0, remaining: 0, failed: 0 };
  for (const table of options.tables ?? ENCRYPTED_TABLES) {
    const summary = await rotateTable(sql, table, options.keys, options.dryRun, batchSize, log);
    tables[table.table] = summary;
    add(totals, summary);
  }
  return { tables, totals, durationMs: Date.now() - started };
}

async function rotateTable(sql: postgres.Sql, table: EncryptedTable, keys: RotationKeys, dryRun: boolean, batchSize: number, log: RotationLog): Promise<TableSummary> {
  const started = Date.now();
  const summary: TableSummary = { current: 0, rotated: 0, remaining: 0, failed: 0 };
  const selected = [...table.keyColumns, ...table.columns.map((column) => column.name)];
  // Key columns never change, so the ordering is stable across batches even while rows are rewritten.
  for (let offset = 0; ; offset += batchSize) {
    const rows = await sql<RotationRow[]>`
      select ${sql(selected)} from ${sql(REDSKY_SCHEMA)}.${sql(table.table)}
      order by ${sql(table.keyColumns)} offset ${offset} limit ${batchSize}`;
    for (const row of rows) {
      const plan = planRow(table, row, keys);
      if (plan.status === 'current') {
        summary.current += 1;
      } else if (plan.status === 'failed') {
        summary.failed += 1;
        log('error', 'Row decrypts with neither key', { table: table.table, userId: row.user_id, column: plan.column });
      } else if (dryRun) {
        summary.remaining += 1;
      } else if (await rewriteRow(sql, table, row, plan.updates)) {
        summary.rotated += 1;
      } else {
        summary.remaining += 1;
        log('warn', 'Row changed during rotation and was left as is', { table: table.table, userId: row.user_id });
      }
    }
    if (rows.length < batchSize) break;
  }
  log('info', dryRun ? 'Table checked' : 'Table rotated', { table: table.table, ...summary, durationMs: Date.now() - started });
  return summary;
}

// Writes only if the stored ciphertexts are still the ones that were planned from, so a concurrent write by the
// application (always under the primary key) is never overwritten.
async function rewriteRow(sql: postgres.Sql, table: EncryptedTable, row: RotationRow, updates: Record<string, string | Buffer>): Promise<boolean> {
  const columns = Object.keys(updates);
  const unchanged = [...table.keyColumns, ...columns].map((column) => sql`${sql(column)} = ${row[column] as string | Buffer}`).reduce((left, right) => sql`${left} and ${right}`);
  const result = await sql`update ${sql(REDSKY_SCHEMA)}.${sql(table.table)} set ${sql(updates, ...columns)} where ${unchanged}`;
  return result.count === 1;
}
