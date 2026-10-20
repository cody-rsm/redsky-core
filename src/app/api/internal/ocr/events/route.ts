import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getConfig } from '@/server/config/env';
import { verifyOcrEvent } from '@/server/documents/ocr-events';
import { errorResponse, handleError, json } from '@/server/http/api';
import { logger } from '@/server/logging/logger';
import { applyOcrEvent } from '@/server/services/document-service';

const MAX_BODY_BYTES = 64 * 1024;

// redsky-ocr's "document finished" events (services/ocr/README.md, Events). Not a browser endpoint: there is no
// session, and the HMAC signature is the only credential. A non-2xx answer makes redsky-ocr retry later.
export async function POST(request: NextRequest): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const secret = getConfig().documents.ocr?.eventsSecret;
  if (!secret) return errorResponse(404, 'not_found', 'Not found');
  try {
    if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return errorResponse(413, 'too_large', 'Request body is too large');
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return errorResponse(413, 'too_large', 'Request body is too large');
    const verified = verifyOcrEvent(secret, body, {
      timestamp: request.headers.get('x-redsky-timestamp'),
      signature: request.headers.get('x-redsky-signature'),
      eventId: request.headers.get('x-redsky-event-id'),
    });
    if (!verified.ok) {
      logger.warn('Rejected a text extraction event', { requestId, reason: verified.reason });
      return verified.reason === 'malformed' ? errorResponse(400, 'invalid_event', 'Malformed event') : errorResponse(401, 'invalid_signature', 'Invalid signature');
    }
    const outcome = await applyOcrEvent(verified.event);
    logger.info('Text extraction event', { requestId, eventId: verified.event.id, type: verified.event.type, outcome });
    return json({ outcome });
  } catch (error) {
    return handleError(error, request, requestId);
  }
}
