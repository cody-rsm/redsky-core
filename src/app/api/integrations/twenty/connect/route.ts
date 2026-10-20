import { NextResponse } from 'next/server';
import { sanitizeReturnTo } from '@/server/auth/entra';
import { getConfig } from '@/server/config/env';
import { authedRoute } from '@/server/http/api';
import { logger } from '@/server/logging/logger';
import { beginConnect, TWENTY_COOKIE_PATH, TWENTY_TRANSACTION_COOKIE, TwentyConnectionError } from '@/server/integrations/crm/twenty-connection';

// Starts connecting the signed-in person's Twenty account: a top-level navigation to Twenty's consent page.
export const GET = authedRoute(
  async ({ request, user }) => {
    const config = getConfig();
    const returnTo = request.nextUrl.searchParams.get('returnTo');
    try {
      const { url, transactionCookie } = await beginConnect(user.id, returnTo);
      const response = NextResponse.redirect(url);
      response.cookies.set(TWENTY_TRANSACTION_COOKIE, transactionCookie, { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: TWENTY_COOKIE_PATH, maxAge: 600 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch (error) {
      logger.warn('Could not start the Twenty connection', { reason: error instanceof TwentyConnectionError ? error.reason : 'unknown' });
      const back = new URL(sanitizeReturnTo(returnTo), config.appUrl ?? request.nextUrl.origin);
      back.searchParams.set('crm', error instanceof TwentyConnectionError && error.reason === 'not_configured' ? 'not_configured' : 'unreachable');
      return NextResponse.redirect(back);
    }
  },
  { rateLimit: { name: 'twenty-connect', capacity: 5, perMinute: 10 } },
);
