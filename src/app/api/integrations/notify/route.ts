import { z } from 'zod';
import { CONNECTOR_IDS } from '@/features/integrations/catalog';
import { authedRoute, readJson } from '@/server/http/api';
import { allConnectorIds, cancelNotification, requestNotification } from '@/server/services/integration-service';

const bodySchema = z.union([
  z.object({ connectorIds: z.array(z.enum(CONNECTOR_IDS)).min(1).max(CONNECTOR_IDS.length) }),
  z.object({ all: z.literal(true) }),
  z.object({ cancel: z.enum(CONNECTOR_IDS) }),
]);

export const POST = authedRoute(async ({ request, user, actor, requestId }) => {
  const body = bodySchema.parse(await readJson(request));
  if ('cancel' in body) await cancelNotification(actor, user.id, body.cancel);
  else await requestNotification(actor, user.id, 'all' in body ? allConnectorIds() : body.connectorIds, requestId);
  return { ok: true };
});
