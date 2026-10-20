import 'server-only';
import { and, eq } from 'drizzle-orm';
import { CONNECTORS, type ConnectorId } from '@/features/integrations/catalog';
import { getDb } from '@/server/db/client';
import { integrationRequests } from '@/server/db/schema';
import { assertAuthorized, type Actor } from '@/server/security/access-policy';
import { recordAudit } from '@/server/security/audit';

// Every connector is "Coming soon" in this release (SPEC §8). "Notify me" is recorded so the RedSky team knows
// who is waiting for which connector; nothing is connected.
export async function requestNotification(actor: Actor, userId: string, connectorIds: ConnectorId[], requestId: string): Promise<void> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  if (connectorIds.length === 0) return;
  await getDb()
    .insert(integrationRequests)
    .values(connectorIds.map((connectorId) => ({ userId, connectorId, state: 'notify' as const })))
    .onConflictDoNothing();
  await recordAudit({ actorUserId: userId, action: 'integration.notify_requested', resourceType: 'connector', resourceId: connectorIds.length === 1 ? (connectorIds[0] ?? null) : null, requestId, metadata: { count: connectorIds.length } });
}

export async function cancelNotification(actor: Actor, userId: string, connectorId: ConnectorId): Promise<void> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  await getDb().delete(integrationRequests).where(and(eq(integrationRequests.userId, userId), eq(integrationRequests.connectorId, connectorId)));
}

export function allConnectorIds(): ConnectorId[] {
  return CONNECTORS.map((connector) => connector.id);
}
