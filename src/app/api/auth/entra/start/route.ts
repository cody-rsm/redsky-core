import { NextResponse, type NextRequest } from 'next/server';
import { beginSignIn, OIDC_TRANSACTION_COOKIE } from '@/server/auth/entra';
import { getConfig } from '@/server/config/env';
import { logger } from '@/server/logging/logger';

export async function GET(request: NextRequest) {
  const config = getConfig();
  const loginUrl = new URL('/login', config.appUrl ?? request.nextUrl.origin);
  if (config.auth.mode !== 'entra') {
    loginUrl.searchParams.set('error', 'not_configured');
    return NextResponse.redirect(loginUrl);
  }
  try {
    const { url, transactionCookie } = await beginSignIn(request.nextUrl.searchParams.get('returnTo') ?? '/');
    const response = NextResponse.redirect(url);
    response.cookies.set(OIDC_TRANSACTION_COOKIE, transactionCookie, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/api/auth/entra',
      maxAge: 600,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    logger.error('Could not start Entra sign-in', { error });
    loginUrl.searchParams.set('error', 'signin_failed');
    return NextResponse.redirect(loginUrl);
  }
}
