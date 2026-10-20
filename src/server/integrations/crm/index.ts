import 'server-only';
import { getConfig } from '@/server/config/env';
import { logger } from '@/server/logging/logger';
import { accessTokenFor, connectionStatus } from './twenty-connection';
import { TwentyCrmAdapter } from './twenty-adapter';
import type { CrmAdapter } from './types';

export type CrmAccess = { status: 'not_configured' } | { status: 'not_connected' } | { status: 'reconnect' } | { status: 'connected'; adapter: CrmAdapter };

let reportedIssues = false;

// The CRM as the given person sees it. There is no shared credential: without their own connection to Twenty,
// RedSky shows an honest "connect" state instead of CRM data (docs/DECISIONS.md 7).
export async function getCrmAccess(userId: string): Promise<CrmAccess> {
  const { crm } = getConfig();
  if (crm.issues.length > 0 && !reportedIssues) {
    reportedIssues = true;
    logger.warn('The Twenty connection has configuration issues', { issues: crm.issues });
  }
  if (crm.provider !== 'twenty' || !crm.baseUrl) return { status: 'not_configured' };
  const connection = await connectionStatus(userId);
  if (connection.status === 'not_connected' || connection.status === 'reconnect' || connection.status === 'not_configured') return { status: connection.status };
  return { status: 'connected', adapter: new TwentyCrmAdapter(crm.baseUrl, (options) => accessTokenFor(userId, options)) };
}
