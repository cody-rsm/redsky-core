import 'server-only';

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
// Keys whose values are never written to logs, at any depth.
const REDACTED_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|code_?verifier|nonce|state|email|phone|profile|assessment|ciphertext|session/i;
const MAX_DEPTH = 4;

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? 'info') as Level;
  return LEVEL_RANK[configured] ?? LEVEL_RANK.info;
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.test(key) ? '[redacted]' : redact(entry, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

function write(level: Level, message: string, fields: Fields = {}) {
  if (LEVEL_RANK[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...(redact(fields) as Fields) });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Fields) => write('debug', message, fields),
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
};
