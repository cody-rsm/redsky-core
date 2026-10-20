import type { CrmConnectionView } from '@/lib/api/contracts';
import { authedRoute } from '@/server/http/api';
import { connectionStatus, disconnect } from '@/server/integrations/crm/twenty-connection';
import { recordAudit } from '@/server/security/audit';

export const GET = authedRoute(async ({ user }): Promise<CrmConnectionView> => connectionStatus(user.id));

// Disconnects this person's Twenty account: revokes the grant in Twenty and forgets the tokens.
export const DELETE = authedRoute(async ({ user, requestId }): Promise<CrmConnectionView> => {
  await disconnect(user.id);
  await recordAudit({ actorUserId: user.id, action: 'integration.twenty_disconnected', resourceType: 'integration', resourceId: 'twenty', requestId });
  return connectionStatus(user.id);
});
