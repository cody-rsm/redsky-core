import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// redsky-ocr signs each event with the hex HMAC-SHA256 of `timestamp + "." + body` (services/ocr/README.md,
// Events). Delivery is at least once, so the event id is the idempotency key.

export const OCR_EVENT_MAX_AGE_MS = 5 * 60 * 1000;

const eventSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['document.completed', 'document.needs_review', 'document.failed', 'document.deleted']),
  occurredAt: z.string().datetime({ offset: true }),
  tenantId: z.string(),
  document: z.object({
    id: z.string().uuid(),
    source: z.object({ system: z.string(), id: z.string() }),
    status: z.enum(['uploaded', 'queued', 'processing', 'completed', 'failed', 'needs_review']),
    statusReason: z.string().nullable(),
  }),
  extractionId: z.string().uuid().nullable(),
});

export type OcrEvent = z.infer<typeof eventSchema>;

export type VerifiedEvent = { ok: true; event: OcrEvent } | { ok: false; reason: 'signature' | 'stale' | 'malformed' };

export function signOcrEvent(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifyOcrEvent(secret: string, body: string, headers: { timestamp: string | null; signature: string | null; eventId: string | null }, now = Date.now()): VerifiedEvent {
  const { timestamp, signature } = headers;
  if (!timestamp || !signature || !/^\d{10,16}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: 'signature' };
  const expected = Buffer.from(signOcrEvent(secret, timestamp, body), 'hex');
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return { ok: false, reason: 'signature' };
  // Checked after the signature, so an unsigned request learns nothing about the clock.
  if (Math.abs(now - Number(timestamp)) > OCR_EVENT_MAX_AGE_MS) return { ok: false, reason: 'stale' };
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success || (headers.eventId && headers.eventId !== parsed.data.id)) return { ok: false, reason: 'malformed' };
  return { ok: true, event: parsed.data };
}
