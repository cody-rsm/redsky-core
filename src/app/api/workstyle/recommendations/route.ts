import { z } from 'zod';
import { WS_RECOMMENDATION_IDS } from '@/features/workstyle/catalog';
import { authedRoute, readJson } from '@/server/http/api';
import { changeRecommendations } from '@/server/services/workstyle-service';

const bodySchema = z.union([
  z.object({ acceptAll: z.literal(true) }),
  z.object({ id: z.enum(WS_RECOMMENDATION_IDS), status: z.enum(['pending', 'accepted', 'dismissed']).optional(), choice: z.string().max(40).optional() }),
]);

export const PATCH = authedRoute(async ({ request, user, actor, requestId }) => changeRecommendations(actor, user.id, bodySchema.parse(await readJson(request)), requestId));
