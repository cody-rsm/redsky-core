import { NextResponse, type NextRequest } from 'next/server';
import * as oidc from 'openid-client';
import { sanitizeReturnTo } from '@/server/auth/entra';
import { getSessionUser } from '@/server/auth/session';
import { getConfig } from '@/server/config/env';
import { completeTwentyConnect, CRM_TRANSACTION_COOKIE } from '@/server/integrations/crm/twenty-oauth';
import { logger } from '@/server/logging/logger';
import { recordAudit } from '@/server/security/audit';

// Twenty redirects here after the person approves (or cancels) on its consent page.
export async function GET(request: NextRequest) {
  const config = getConfig();
  const base = config.appUrl ?? request.nextUrl.origin;
  const finish = (path: string, outcome?: 'failed' | 'denied') => {
    const url = new URL(sanitizeReturnTo(path), base);
    if (outcome) url.searchParams.set('crm', outcome);
    const response = NextResponse.redirect(url);
    response.cookies.delete({ name: CRM_TRANSACTION_COOKIE, path: '/api/integrations/twenty' });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  const user = await getSessionUser();
  if (!user) return finish('/login');
  if (config.crm.access !== 'per_user') return finish('/people');
  if (request.nextUrl.searchParams.get('error')) {
    await recordAudit({ actorUserId: user.id, action: 'crm.connect_failed', resourceType: 'crm_connection', outcome: 'denied', metadata: { provider: 'twenty', reason: 'consent_declined' } });
    return finish('/people', 'denied');
  }
  try {
    const { returnTo } = await completeTwentyConnect(request.nextUrl.searchParams, request.cookies.get(CRM_TRANSACTION_COOKIE)?.value, user.id);
    return finish(returnTo);
  } catch (error) {
    const reason = error instanceof oidc.ResponseBodyError ? error.error : error instanceof Error ? error.message.slice(0, 80) : 'unknown';
    logger.warn('CRM connection failed', { reason });
    await recordAudit({ actorUserId: user.id, action: 'crm.connect_failed', resourceType: 'crm_connection', outcome: 'failure', metadata: { provider: 'twenty' } });
    return finish('/people', 'failed');
  }
}
