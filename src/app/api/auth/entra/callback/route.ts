import { NextResponse, type NextRequest } from 'next/server';
import { completeSignIn, OIDC_TRANSACTION_COOKIE } from '@/server/auth/entra';
import { provisionEntraUser } from '@/server/auth/provisioning';
import { createSession, sessionCookieName } from '@/server/auth/session';
import { getConfig } from '@/server/config/env';
import { logger } from '@/server/logging/logger';
import { recordAudit } from '@/server/security/audit';

export async function GET(request: NextRequest) {
  const config = getConfig();
  const base = config.appUrl ?? request.nextUrl.origin;
  const fail = (code: string) => {
    const url = new URL('/login', base);
    url.searchParams.set('error', code);
    const response = NextResponse.redirect(url);
    response.cookies.delete({ name: OIDC_TRANSACTION_COOKIE, path: '/api/auth/entra' });
    return response;
  };
  if (config.auth.mode !== 'entra') return fail('not_configured');
  if (request.nextUrl.searchParams.get('error')) {
    await recordAudit({ actorUserId: null, action: 'auth.login_denied', resourceType: 'session', outcome: 'denied', metadata: { provider: 'entra', reason: 'idp_error' } });
    return fail('denied');
  }
  try {
    const { identity, returnTo } = await completeSignIn(request.nextUrl.searchParams, request.cookies.get(OIDC_TRANSACTION_COOKIE)?.value);
    const userId = await provisionEntraUser(identity);
    const session = await createSession(userId);
    await recordAudit({ actorUserId: userId, action: 'auth.login', resourceType: 'session', metadata: { provider: 'entra' } });
    const response = NextResponse.redirect(new URL(returnTo, base));
    response.cookies.set(sessionCookieName(), session.token, { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/', expires: session.expiresAt });
    response.cookies.delete({ name: OIDC_TRANSACTION_COOKIE, path: '/api/auth/entra' });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    logger.warn('Entra sign-in failed', { error });
    await recordAudit({ actorUserId: null, action: 'auth.login_denied', resourceType: 'session', outcome: 'failure', metadata: { provider: 'entra' } });
    return fail('signin_failed');
  }
}
