import { DEMO_RECS } from '@/demo/sample-records';
import { getConfig } from '@/server/config/env';
import { authedRoute } from '@/server/http/api';
import { notFound } from '@/server/http/errors';
import { patchItemState } from '@/server/services/item-state-service';

export const POST = authedRoute<{ id: string }>(async ({ params, user, actor }) => {
  const exists = Object.values(DEMO_RECS).some((list) => list.some((rec) => rec.id === params.id));
  if (getConfig().dataMode !== 'demo' || !exists) throw notFound('Recommendation not found');
  await patchItemState(actor, user.id, 'demo', `rec:${params.id}`, { dismissed: true });
  return { ok: true };
});
