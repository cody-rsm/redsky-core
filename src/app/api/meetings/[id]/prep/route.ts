import { z } from 'zod';
import { getConfig } from '@/server/config/env';
import { getDataProvider } from '@/server/data';
import { authedRoute, readJson } from '@/server/http/api';
import { notFound } from '@/server/http/errors';
import { loadItemStates, patchItemState } from '@/server/services/item-state-service';
import { buildProviderContext } from '@/server/services/workspace-service';

export const GET = authedRoute<{ id: string }>(async ({ params, user, actor }) => {
  const prep = await getDataProvider().meetingPrep(params.id, await buildProviderContext(user, actor));
  if (!prep) throw notFound('Meeting not found');
  return prep;
});

const patchSchema = z.object({ prepared: z.boolean().optional(), followup: z.object({ index: z.number().int().min(0).max(20), done: z.boolean() }).optional() });

export const PATCH = authedRoute<{ id: string }>(async ({ request, params, user, actor }) => {
  const body = patchSchema.parse(await readJson(request));
  const context = await buildProviderContext(user, actor);
  if (getConfig().dataMode !== 'demo' || !(await getDataProvider().meetingPrep(params.id, context))) throw notFound('Meeting not found');
  const key = `meeting:${params.id}`;
  const current = (await loadItemStates(user.id, 'demo')).get(key) ?? {};
  const followups = new Set(current.followupsDone ?? []);
  if (body.followup) {
    if (body.followup.done) followups.add(body.followup.index);
    else followups.delete(body.followup.index);
  }
  await patchItemState(actor, user.id, 'demo', key, { ...(body.prepared !== undefined ? { prepared: body.prepared } : {}), followupsDone: [...followups] });
  return { ok: true };
});
