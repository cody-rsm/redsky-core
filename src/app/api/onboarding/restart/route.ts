import { authedRoute } from '@/server/http/api';
import { restartOnboarding } from '@/server/services/onboarding-service';

export const POST = authedRoute(async ({ user, actor, requestId }) => {
  await restartOnboarding(actor, user.id, requestId);
  return { ok: true };
});
