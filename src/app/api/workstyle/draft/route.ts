import { workstyleProfileDraftSchema } from '@/features/workstyle/profile';
import { authedRoute, readJson } from '@/server/http/api';
import { saveDraft } from '@/server/services/workstyle-service';

export const PUT = authedRoute(async ({ request, user, actor, requestId }) => {
  await saveDraft(actor, user.id, workstyleProfileDraftSchema.parse(await readJson(request)), requestId);
  return { ok: true };
});
