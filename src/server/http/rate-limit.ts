import 'server-only';

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

// In-process token bucket. RedSky runs as a single web service; if it is scaled out, move this to Postgres or
// Redis so limits hold across instances.
export function consumeRateLimit(key: string, capacity: number, refillPerMinute: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const refill = ((now - bucket.updatedAt) / 60_000) * refillPerMinute;
  bucket.tokens = Math.min(capacity, bucket.tokens + refill);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    for (const [entryKey, entry] of buckets) if (now - entry.updatedAt > 10 * 60_000) buckets.delete(entryKey);
  }
  return true;
}
