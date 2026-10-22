// Re-encrypts stored secrets under a new REDSKY_ENCRYPTION_KEY, reading rows still under the previous key
// (REDSKY_FALLBACK_ENCRYPTION_KEY). Safe to interrupt and run again: rows already under the new key are skipped.
// Usage: node dist/rotate-encryption-key.mjs [--dry-run] [--batch-size=200]   (docs/DEPLOYMENT.md §12)
import postgres from 'postgres';
import { checkMigrationTarget } from '../src/server/db/migration-guard';
import { decodeEncryptionKey } from '../src/server/security/crypto';
import { rotateEncryptionKey, type RotationLog } from '../src/server/security/key-rotation';

const log: RotationLog = (level, message, extra = {}) => {
  const line = JSON.stringify({ level, time: new Date().toISOString(), component: 'rotate-encryption-key', message, ...extra });
  if (level === 'info') console.log(line);
  else console.error(line);
};

function parseArguments(argv: string[]): { dryRun: boolean; batchSize: number } | null {
  let dryRun = false;
  let batchSize = 200;
  for (const argument of argv) {
    if (argument === '--dry-run') dryRun = true;
    else if (argument.startsWith('--batch-size=')) batchSize = Number(argument.slice('--batch-size='.length));
    else {
      log('error', 'Unknown argument', { argument });
      return null;
    }
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    log('error', '--batch-size must be a whole number between 1 and 5000');
    return null;
  }
  return { dryRun, batchSize };
}

async function main(): Promise<number> {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return 1;
  const url = process.env.REDSKY_DATABASE_URL;
  const primary = process.env.REDSKY_ENCRYPTION_KEY ? decodeEncryptionKey(process.env.REDSKY_ENCRYPTION_KEY) : null;
  const fallback = process.env.REDSKY_FALLBACK_ENCRYPTION_KEY ? decodeEncryptionKey(process.env.REDSKY_FALLBACK_ENCRYPTION_KEY) : null;
  if (!url || !primary || !fallback) {
    const missing = [!url && 'REDSKY_DATABASE_URL', !primary && 'REDSKY_ENCRYPTION_KEY', !fallback && 'REDSKY_FALLBACK_ENCRYPTION_KEY'].filter(Boolean);
    log('error', 'Missing or invalid configuration; nothing was rotated', { missing });
    return 1;
  }
  if (primary.equals(fallback)) {
    log('error', 'REDSKY_FALLBACK_ENCRYPTION_KEY is the same as REDSKY_ENCRYPTION_KEY; nothing to rotate');
    return 1;
  }
  const database = new URL(url).pathname.replace(/^\//, '') || '(default)';
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 15 });
  try {
    const guard = await checkMigrationTarget(sql);
    if (!guard.ok || guard.fresh) {
      log('error', 'Refusing to rotate', { database, reason: guard.ok ? 'This database has no RedSky tables yet.' : guard.reason });
      return 2;
    }
    log('info', options.dryRun ? 'Checking which rows still use the previous key' : 'Rotating the encryption key', { database, batchSize: options.batchSize });
    const summary = await rotateEncryptionKey(sql, { keys: { primary, fallback }, dryRun: options.dryRun, batchSize: options.batchSize, log });
    const { totals, durationMs } = summary;
    if (totals.failed > 0) {
      log('error', 'Some rows decrypt with neither key; fix or delete them and run again', { database, ...totals, durationMs });
      return 1;
    }
    if (options.dryRun) log('info', totals.remaining === 0 ? 'Every row uses the current key; the fallback key can be removed' : 'Rows still use the previous key; run without --dry-run', { database, ...totals, durationMs });
    else log('info', totals.remaining === 0 ? 'Rotation complete; confirm with --dry-run, then remove the fallback key' : 'Rotation incomplete; run again', { database, ...totals, durationMs });
    return 0;
  } catch (error) {
    log('error', 'Rotation failed', { database, error: error instanceof Error ? error.message : String(error) });
    return 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().then((code) => process.exit(code));
