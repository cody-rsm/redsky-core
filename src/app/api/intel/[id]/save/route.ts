import { z } from 'zod';
import { DEMO_INTEL } from '@/demo/sample-records';
import { getConfig } from '@/server/config/env';
import { authedRoute, readJson } from '@/server/http/api';
import { notFound } from '@/server/http/errors';
import { patchItemState } from '@/server/services/item-state-service';

export const POST = authedRoute<{ id: string }>(async ({ request, params, user, actor }) => {
  const { saved } = z.object({ saved: z.boolean() }).parse(await readJson(request));
  if (getConfig().dataMode !== 'demo' || !DEMO_INTEL.some((item) => item.id === params.id)) throw notFound('Item not found');
  await patchItemState(actor, user.id, 'demo', `intel:${params.id}`, { saved });
  return { ok: true };
});
