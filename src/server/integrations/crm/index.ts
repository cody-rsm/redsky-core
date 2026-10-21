import 'server-only';
import { getConfig } from '@/server/config/env';
import { TwentyCrmAdapter } from './twenty-adapter';
import { isTwentyConnected, twentyAccessToken } from './twenty-oauth';
import type { CrmConnectionState } from '@/lib/api/contracts';
import type { CrmAdapter } from './types';

export type CrmAccess = { status: 'ok'; adapter: CrmAdapter } | { status: 'not_configured' } | { status: 'connect_required' };

let sharedAdapter: CrmAdapter | null = null;

// The CRM as this person may use it. With per-user access the adapter carries their own token, so Twenty applies
// their permissions; someone who has not connected gets `connect_required`, never another credential.
export async function crmAccessFor(userId: string): Promise<CrmAccess> {
  const { crm } = getConfig();
  if (crm.access === 'none' || !crm.baseUrl) return { status: 'not_configured' };
  if (crm.access === 'shared_key' && crm.apiKey) {
    sharedAdapter ??= new TwentyCrmAdapter(crm.baseUrl, crm.apiKey);
    return { status: 'ok', adapter: sharedAdapter };
  }
  const token = await twentyAccessToken(userId);
  return token ? { status: 'ok', adapter: new TwentyCrmAdapter(crm.baseUrl, token) } : { status: 'connect_required' };
}

export async function crmConnectionState(userId: string): Promise<CrmConnectionState> {
  const { crm } = getConfig();
  if (crm.access === 'none') return 'not_configured';
  if (crm.access === 'shared_key') return 'connected';
  return (await isTwentyConnected(userId)) ? 'connected' : 'connect_required';
}
