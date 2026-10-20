import { z } from 'zod';
import { DEMO_ATT } from '@/demo/sample-records';
import { getConfig } from '@/server/config/env';
import { authedRoute, readJson } from '@/server/http/api';
import { notFound } from '@/server/http/errors';
import { patchItemState } from '@/server/services/item-state-service';
import { updateTask } from '@/server/services/task-service';
import { buildProviderContext } from '@/server/services/workspace-service';

const bodySchema = z.object({ done: z.boolean().optional(), dismissed: z.boolean().optional() }).refine((body) => body.done !== undefined || body.dismissed !== undefined);

// Complete / dismiss (and undo) an item in Needs Your Attention. RedSky tasks update the task row; demo items
// record per-user state so sample data itself is never modified.
export const PATCH = authedRoute<{ key: string }>(async ({ request, params, user, actor }) => {
  const body = bodySchema.parse(await readJson(request));
  const [kind, id] = decodeURIComponent(params.key).split(':');
  if (kind === 'task' && id && /^[0-9a-f-]{36}$/i.test(id)) {
    await updateTask(actor, user.id, id, body);
    return { ok: true };
  }
  if (kind === 'demo' && id && getConfig().dataMode === 'demo') {
    const context = await buildProviderContext(user, actor);
    const item = DEMO_ATT.find((entry) => entry.id === id && entry.pids.includes(context.persona));
    if (!item) throw notFound('Item not found');
    await patchItemState(actor, user.id, 'demo', `att:${id}`, body);
    return { ok: true };
  }
  throw notFound('Item not found');
});
