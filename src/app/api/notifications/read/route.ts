import { getConfig } from '@/server/config/env';
import { authedRoute } from '@/server/http/api';
import { patchItemState } from '@/server/services/item-state-service';

export const POST = authedRoute(async ({ user, actor }) => {
  await patchItemState(actor, user.id, getConfig().dataMode === 'demo' ? 'demo' : 'crm', 'notif:all', { read: true });
  return { ok: true };
});
