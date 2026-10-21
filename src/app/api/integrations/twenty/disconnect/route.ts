import { getConfig } from '@/server/config/env';
import { authedRoute } from '@/server/http/api';
import { disconnectTwenty } from '@/server/integrations/crm/twenty-oauth';

export const POST = authedRoute(async ({ user, requestId }) => {
  if (getConfig().crm.access === 'per_user') await disconnectTwenty(user.id, requestId);
  return { ok: true };
});
