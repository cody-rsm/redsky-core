import { z } from 'zod';
import { authedRoute, readJson } from '@/server/http/api';
import { setSharing } from '@/server/services/workstyle-service';

const bodySchema = z.object({ scope: z.enum(['manager', 'colleagues']), enabled: z.boolean(), consent: z.boolean() }).refine((body) => !body.enabled || body.consent, 'Sharing requires your explicit consent');

export const PATCH = authedRoute(async ({ request, user, actor, requestId }) => {
  const body = bodySchema.parse(await readJson(request));
  return setSharing(actor, user.id, body.scope, body.enabled, requestId);
});
