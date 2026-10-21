import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeReturnTo } from '@/server/auth/entra';
import { getSessionUser } from '@/server/auth/session';
import { getConfig } from '@/server/config/env';
import { beginTwentyConnect, CRM_TRANSACTION_COOKIE } from '@/server/integrations/crm/twenty-oauth';
import { logger } from '@/server/logging/logger';

// Starts connecting the signed-in person to the CRM: a browser navigation to Twenty's consent page.
export async function GET(request: NextRequest) {
  const config = getConfig();
  const base = config.appUrl ?? request.nextUrl.origin;
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo') ?? '/people');
  const user = await getSessionUser();
  if (!user) {
    const login = new URL('/login', base);
    login.searchParams.set('returnTo', returnTo);
    return NextResponse.redirect(login);
  }
  const back = new URL(returnTo, base);
  if (config.crm.access !== 'per_user') return NextResponse.redirect(back);
  try {
    const { url, transactionCookie } = await beginTwentyConnect(user.id, returnTo);
    const response = NextResponse.redirect(url);
    response.cookies.set(CRM_TRANSACTION_COOKIE, transactionCookie, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/api/integrations/twenty',
      maxAge: 600,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    logger.error('Could not start the CRM connection', { error });
    back.searchParams.set('crm', 'failed');
    return NextResponse.redirect(back);
  }
}
