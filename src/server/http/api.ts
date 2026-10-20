import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { actorFor, getSessionUser, type SessionUser } from '@/server/auth/session';
import { getConfig } from '@/server/config/env';
import { DatabaseNotConfiguredError } from '@/server/db/client';
import { logger } from '@/server/logging/logger';
import { AccessDeniedError, type Actor } from '@/server/security/access-policy';
import { recordAudit } from '@/server/security/audit';
import { HttpError, tooManyRequests } from './errors';
import { consumeRateLimit } from './rate-limit';

export type ApiContext<TParams> = { request: NextRequest; params: TParams; user: SessionUser; actor: Actor; requestId: string };

type RouteOptions = { rateLimit?: { name: string; capacity: number; perMinute: number } };

type Handler<TParams> = (context: ApiContext<TParams>) => Promise<Response | unknown>;

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export function json(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

export function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}): NextResponse {
  return json({ error: { code, message, ...extra } }, { status });
}

// Mutations must come from RedSky's own pages. SameSite=Lax cookies already block most cross-site requests;
// the Origin check closes the rest (CSRF).
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const expected = getConfig().appUrl?.origin ?? request.nextUrl.origin;
  return origin === expected;
}

// Wraps every authenticated route handler: session validation, CSRF check, rate limits, typed errors,
// redacted logging and no-store responses.
export function authedRoute<TParams = Record<string, never>>(handler: Handler<TParams>, options: RouteOptions = {}) {
  return async (request: NextRequest, segment: { params: Promise<TParams> }): Promise<Response> => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    try {
      if (mutating && !isSameOrigin(request)) return errorResponse(403, 'forbidden_origin', 'Request origin not allowed');
      const user = await getSessionUser();
      if (!user) return errorResponse(401, 'unauthenticated', 'Sign in to continue');
      if (options.rateLimit && !consumeRateLimit(`${options.rateLimit.name}:${user.id}`, options.rateLimit.capacity, options.rateLimit.perMinute)) throw tooManyRequests();
      const params = segment?.params ? await segment.params : ({} as TParams);
      const result = await handler({ request, params, user, actor: actorFor(user), requestId });
      if (result instanceof Response) return result;
      return json(result ?? { ok: true });
    } catch (error) {
      return handleError(error, request, requestId);
    }
  };
}

export async function handleError(error: unknown, request: NextRequest, requestId: string): Promise<Response> {
  if (error instanceof HttpError) return errorResponse(error.status, error.code, error.message);
  if (error instanceof ZodError) {
    return errorResponse(400, 'invalid_input', 'Some fields are invalid', {
      issues: error.issues.slice(0, 20).map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error instanceof AccessDeniedError) {
    const user = await getSessionUser().catch(() => null);
    await recordAudit({ actorUserId: user?.id ?? null, action: 'access.denied', resourceType: 'api', resourceId: request.nextUrl.pathname, outcome: 'denied', requestId });
    return errorResponse(403, 'forbidden', 'You do not have access to this');
  }
  if (error instanceof DatabaseNotConfiguredError) return errorResponse(503, 'unavailable', 'RedSky is not fully configured yet');
  // The browser went away mid-request (navigation, closed tab); nothing failed on our side.
  if (request.signal.aborted) {
    logger.info('Client closed the request', { requestId, path: request.nextUrl.pathname });
    return errorResponse(499, 'client_closed', 'Request was cancelled');
  }
  logger.error('Unhandled API error', { requestId, path: request.nextUrl.pathname, method: request.method, error });
  return errorResponse(500, 'internal_error', 'Something went wrong. Please try again.', { requestId });
}

export async function readJson(request: NextRequest, maxBytes = 256 * 1024): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > maxBytes) throw new HttpError(413, 'too_large', 'Request body is too large');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'Request body is too large');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be JSON');
  }
}
