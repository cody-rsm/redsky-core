import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { checkMigrationTarget } from '@/server/db/migration-guard';

// Runs against real databases when provided (CI or local): a migrated RedSky database and a decoy with Twenty's
// schemas. Skipped otherwise, never mocked — the guard's job is to read the real catalog.
const redskyUrl = process.env.REDSKY_TEST_DATABASE_URL;
const twentyDecoyUrl = process.env.REDSKY_TEST_TWENTY_DECOY_URL;

describe.skipIf(!redskyUrl || !twentyDecoyUrl)('checkMigrationTarget (database)', () => {
  const connections: postgres.Sql[] = [];
  const connect = (url: string) => {
    const sql = postgres(url, { max: 1, onnotice: () => undefined });
    connections.push(sql);
    return sql;
  };
  afterAll(async () => {
    await Promise.all(connections.map((sql) => sql.end()));
  });

  it('refuses a database that contains Twenty CRM schemas', async () => {
    const result = await checkMigrationTarget(connect(twentyDecoyUrl ?? ''));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Twenty CRM schemas/);
  });

  it('accepts a database already marked as RedSky', async () => {
    expect(await checkMigrationTarget(connect(redskyUrl ?? ''))).toEqual({ ok: true, fresh: false });
  });
});
