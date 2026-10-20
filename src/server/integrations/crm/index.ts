import 'server-only';
import { getConfig } from '@/server/config/env';
import { TwentyCrmAdapter } from './twenty-adapter';
import type { CrmAdapter } from './types';

let adapter: CrmAdapter | null | undefined;

// Returns the configured CRM adapter, or null when no CRM credentials are set (RedSky then shows honest
// not-connected states instead of CRM data).
export function getCrmAdapter(): CrmAdapter | null {
  if (adapter !== undefined) return adapter;
  const { crm } = getConfig();
  adapter = crm.provider === 'twenty' && crm.baseUrl && crm.apiKey ? new TwentyCrmAdapter(crm.baseUrl, crm.apiKey) : null;
  return adapter;
}
