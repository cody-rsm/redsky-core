import { NextResponse } from 'next/server';
import { sanitizeReturnTo } from '@/server/auth/entra';
import { getConfig } from '@/server/config/env';
import { authedRoute } from '@/server/http/api';
import { logger } from '@/server/logging/logger';
import { completeConnect, TWENTY_COOKIE_PATH, TWENTY_TRANSACTION_COOKIE, TwentyConnectionError } from '@/server/integrations/crm/twenty-connection';
import { recordAudit } from '@/server/security/audit';

// Twenty redirects here after the person approves (or refuses) RedSky's access. The outcome goes back to the page
// they started from as ?crm=…, which the workspace turns into a message.
export const GET = authedRoute(async ({ request, user, requestId }) => {
  const config = getConfig();
  const base = config.appUrl ?? request.nextUrl.origin;
  const finish = (returnTo: string, outcome: string) => {
    const url = new URL(sanitizeReturnTo(returnTo), base);
    url.searchParams.set('crm', outcome);
    const response = NextResponse.redirect(url);
    response.cookies.delete({ name: TWENTY_TRANSACTION_COOKIE, path: TWENTY_COOKIE_PATH });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  try {
    const { returnTo } = await completeConnect({ id: user.id, email: user.email }, request.nextUrl.searchParams, request.cookies.get(TWENTY_TRANSACTION_COOKIE)?.value);
    await recordAudit({ actorUserId: user.id, action: 'integration.twenty_connected', resourceType: 'integration', resourceId: 'twenty', requestId });
    return finish(returnTo, 'connected');
  } catch (error) {
    const reason = error instanceof TwentyConnectionError ? error.reason : 'unknown';
    logger.warn('Connecting Twenty failed', { requestId, reason });
    await recordAudit({ actorUserId: user.id, action: 'integration.twenty_connect_refused', resourceType: 'integration', resourceId: 'twenty', outcome: reason === 'mismatch' || reason === 'denied' ? 'denied' : 'failure', requestId, metadata: { reason } });
    return finish(error instanceof TwentyConnectionError && error.returnTo ? error.returnTo : '/home', reason === 'unknown' ? 'error' : reason);
  }
});
