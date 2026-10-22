import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptBytes, decryptString, encryptBytes, encryptString } from '@/server/security/crypto';
import { crmTokenContext, workstyleContext } from '@/server/security/encryption-contexts';
import { ENCRYPTED_TABLES, planRow, rotateEncryptionKey, type EncryptedTable, type RotationLog } from '@/server/security/key-rotation';

const keys = { primary: randomBytes(32), fallback: randomBytes(32) };
const strangerKey = randomBytes(32);
const byName = (name: string): EncryptedTable => {
  const table = ENCRYPTED_TABLES.find((candidate) => candidate.table === name);
  if (!table) throw new Error(`no such table ${name}`);
  return table;
};

describe('planRow', () => {
  const userId = randomUUID();

  it('rewrites values still under the previous key with the new key, and leaves empty columns alone', () => {
    const table = byName('workstyle_assessments');
    const row = { user_id: userId, source_name_ciphertext: encryptString('report.pdf', keys.fallback, workstyleContext(userId, 'name')), draft_ciphertext: null, profile_ciphertext: encryptString('{"disc":1}', keys.fallback, workstyleContext(userId, 'profile')) };
    const plan = planRow(table, row, keys);
    expect(plan.status).toBe('rewrite');
    if (plan.status !== 'rewrite') return;
    expect(Object.keys(plan.updates).sort()).toEqual(['profile_ciphertext', 'source_name_ciphertext']);
    expect(decryptString(plan.updates.source_name_ciphertext as string, keys.primary, workstyleContext(userId, 'name'))).toBe('report.pdf');
    expect(decryptString(plan.updates.profile_ciphertext as string, keys.primary, workstyleContext(userId, 'profile'))).toBe('{"disc":1}');
  });

  it('leaves rows already under the new key untouched, including a row with one column each', () => {
    const table = byName('crm_connections');
    const current = { user_id: userId, provider: 'twenty', refresh_token_ciphertext: encryptString('r', keys.primary, crmTokenContext('twenty', userId, 'refresh')), access_token_ciphertext: encryptString('a', keys.primary, crmTokenContext('twenty', userId, 'access')) };
    expect(planRow(table, current, keys)).toEqual({ status: 'current' });

    const mixed = { ...current, access_token_ciphertext: encryptString('a', keys.fallback, crmTokenContext('twenty', userId, 'access')) };
    const plan = planRow(table, mixed, keys);
    expect(plan.status).toBe('rewrite');
    if (plan.status === 'rewrite') expect(Object.keys(plan.updates)).toEqual(['access_token_ciphertext']);
  });

  it('rotates documents stored as bytes', () => {
    const table = byName('workstyle_documents');
    const plan = planRow(table, { user_id: userId, ciphertext: encryptBytes(Buffer.from('%PDF'), keys.fallback, workstyleContext(userId, 'document')) }, keys);
    expect(plan.status).toBe('rewrite');
    if (plan.status === 'rewrite') expect(decryptBytes(plan.updates.ciphertext as Buffer, keys.primary, workstyleContext(userId, 'document')).toString()).toBe('%PDF');
  });

  it('fails a row that neither key can read, naming the column', () => {
    const table = byName('workstyle_assessments');
    const otherUser = randomUUID();
    const foreignKey = { user_id: userId, source_name_ciphertext: null, draft_ciphertext: encryptString('{}', strangerKey, workstyleContext(userId, 'draft')), profile_ciphertext: null };
    expect(planRow(table, foreignKey, keys)).toEqual({ status: 'failed', column: 'draft_ciphertext' });
    const movedBetweenUsers = { user_id: userId, source_name_ciphertext: encryptString('x', keys.fallback, workstyleContext(otherUser, 'name')), draft_ciphertext: null, profile_ciphertext: null };
    expect(planRow(table, movedBetweenUsers, keys)).toEqual({ status: 'failed', column: 'source_name_ciphertext' });
    expect(planRow(table, { user_id: userId, source_name_ciphertext: 'garbage', draft_ciphertext: null, profile_ciphertext: null }, keys)).toEqual({ status: 'failed', column: 'source_name_ciphertext' });
  });
});

// Against a real, migrated RedSky database (REDSKY_TEST_DATABASE_URL, as in CI). Skipped without one.
const databaseUrl = process.env.REDSKY_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('rotateEncryptionKey (database)', () => {
  const sql = postgres(databaseUrl ?? '', { max: 1, onnotice: () => undefined });
  const userIds: string[] = [];
  const logged: { level: string; message: string; extra: Record<string, unknown> }[] = [];
  const log: RotationLog = (level, message, extra = {}) => logged.push({ level, message, extra });
  const secrets = { name: 'TTI report.pdf', draft: '{"draft":true}', profile: '{"profile":true}', document: '%PDF-1.7 report body', refresh: 'refresh-token-value', access: 'access-token-value' };

  const newUser = async () => {
    const [user] = await sql<{ id: string }[]>`insert into redsky.users (auth_provider, auth_subject, email, display_name) values ('dev', ${`rotation-test-${randomUUID()}`}, 'person@example.com', 'Pat Person') returning id`;
    if (!user) throw new Error('user insert failed');
    userIds.push(user.id);
    return user.id;
  };
  const seed = async (userId: string, key: Buffer) => {
    await sql`insert into redsky.workstyle_assessments (user_id, consent_at, consent_version, source_kind, source_name_ciphertext, extraction, draft_ciphertext, profile_ciphertext)
      values (${userId}, now(), 'v1', 'upload', ${encryptString(secrets.name, key, workstyleContext(userId, 'name'))}, ${sql.json({ status: 'extracted' })}, ${encryptString(secrets.draft, key, workstyleContext(userId, 'draft'))}, ${encryptString(secrets.profile, key, workstyleContext(userId, 'profile'))})`;
    await sql`insert into redsky.workstyle_documents (user_id, ciphertext, mime, size_bytes) values (${userId}, ${encryptBytes(Buffer.from(secrets.document), key, workstyleContext(userId, 'document'))}, 'application/pdf', ${secrets.document.length})`;
    await sql`insert into redsky.crm_connections (user_id, provider, refresh_token_ciphertext, access_token_ciphertext, access_token_expires_at)
      values (${userId}, 'twenty', ${encryptString(secrets.refresh, key, crmTokenContext('twenty', userId, 'refresh'))}, ${encryptString(secrets.access, key, crmTokenContext('twenty', userId, 'access'))}, now() + interval '1 hour')`;
  };
  type Stored = { assessment: Record<string, string | null>; document: Buffer; connection: { refresh_token_ciphertext: string; access_token_ciphertext: string } };
  const stored = async (userId: string): Promise<Stored> => {
    const [assessment] = await sql<Record<string, string | null>[]>`select source_name_ciphertext, draft_ciphertext, profile_ciphertext from redsky.workstyle_assessments where user_id = ${userId}`;
    const [document] = await sql<{ ciphertext: Buffer }[]>`select ciphertext from redsky.workstyle_documents where user_id = ${userId}`;
    const [connection] = await sql<Stored['connection'][]>`select refresh_token_ciphertext, access_token_ciphertext from redsky.crm_connections where user_id = ${userId}`;
    if (!assessment || !document || !connection) throw new Error('rows missing');
    return { assessment, document: document.ciphertext, connection };
  };
  const readable = (userId: string, rows: Stored, key: Buffer) => ({
    name: decryptString(rows.assessment.source_name_ciphertext ?? '', key, workstyleContext(userId, 'name')),
    draft: decryptString(rows.assessment.draft_ciphertext ?? '', key, workstyleContext(userId, 'draft')),
    profile: decryptString(rows.assessment.profile_ciphertext ?? '', key, workstyleContext(userId, 'profile')),
    document: decryptBytes(rows.document, key, workstyleContext(userId, 'document')).toString(),
    refresh: decryptString(rows.connection.refresh_token_ciphertext, key, crmTokenContext('twenty', userId, 'refresh')),
    access: decryptString(rows.connection.access_token_ciphertext, key, crmTokenContext('twenty', userId, 'access')),
  });

  let oldKeyUser = '';
  let newKeyUser = '';
  let corruptUser = '';
  let newKeyRows: Stored;

  beforeAll(async () => {
    oldKeyUser = await newUser();
    newKeyUser = await newUser();
    corruptUser = await newUser();
    await seed(oldKeyUser, keys.fallback);
    await seed(newKeyUser, keys.primary);
    await seed(corruptUser, strangerKey);
    newKeyRows = await stored(newKeyUser);
  });

  afterAll(async () => {
    await sql`delete from redsky.users where id in ${sql(userIds)}`;
    await sql.end();
  });

  it('reports what a run would do without changing anything (--dry-run)', async () => {
    const before = await stored(oldKeyUser);
    const summary = await rotateEncryptionKey(sql, { keys, dryRun: true, batchSize: 2, log });
    expect(summary.tables.workstyle_assessments).toMatchObject({ rotated: 0, failed: 1 });
    expect(summary.tables.workstyle_documents).toMatchObject({ rotated: 0, failed: 1 });
    expect(summary.tables.crm_connections).toMatchObject({ rotated: 0, failed: 1 });
    expect(summary.totals.remaining).toBeGreaterThanOrEqual(3);
    expect(summary.totals.current).toBeGreaterThanOrEqual(3);
    expect(await stored(oldKeyUser)).toEqual(before);
    expect(await stored(newKeyUser)).toEqual(newKeyRows);
  });

  it('rewrites rows under the previous key, leaves current rows untouched and fails on a row neither key reads', async () => {
    logged.length = 0;
    const summary = await rotateEncryptionKey(sql, { keys, dryRun: false, batchSize: 2, log });
    expect(summary.totals.failed).toBe(3);
    expect(summary.totals.rotated).toBeGreaterThanOrEqual(3);

    const rotated = await stored(oldKeyUser);
    expect(readable(oldKeyUser, rotated, keys.primary)).toEqual(secrets);
    expect(await stored(newKeyUser)).toEqual(newKeyRows);
    expect(readable(corruptUser, await stored(corruptUser), strangerKey)).toEqual(secrets);

    const failures = logged.filter((entry) => entry.level === 'error');
    expect(failures.map((entry) => [entry.extra.table, entry.extra.userId])).toEqual([
      ['workstyle_assessments', corruptUser],
      ['workstyle_documents', corruptUser],
      ['crm_connections', corruptUser],
    ]);
    const output = JSON.stringify(logged);
    for (const secret of Object.values(secrets)) expect(output).not.toContain(secret);
    expect(output).not.toContain(keys.primary.toString('base64'));
  });

  it('is idempotent: a second run finds nothing left to rotate', async () => {
    await sql`delete from redsky.users where id = ${corruptUser}`;
    const after = await stored(oldKeyUser);
    const summary = await rotateEncryptionKey(sql, { keys, dryRun: false, log });
    expect(summary.totals.failed).toBe(0);
    expect(summary.totals.rotated).toBe(0);
    expect(summary.totals.remaining).toBe(0);
    expect(await stored(oldKeyUser)).toEqual(after);
    expect((await rotateEncryptionKey(sql, { keys, dryRun: true, log })).totals.remaining).toBe(0);
  });
});
