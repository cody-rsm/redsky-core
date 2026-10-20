import { authedRoute } from '@/server/http/api';
import { deleteAssessment, getWorkstyleDetail } from '@/server/services/workstyle-service';

export const GET = authedRoute(async ({ user, actor, requestId }) => getWorkstyleDetail(actor, user.id, requestId));

export const DELETE = authedRoute(async ({ user, actor, requestId }) => {
  await deleteAssessment(actor, user.id, requestId);
  return { ok: true };
});
