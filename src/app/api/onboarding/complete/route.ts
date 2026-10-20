import { authedRoute } from '@/server/http/api';
import { completeOnboarding } from '@/server/services/onboarding-service';

export const POST = authedRoute(async ({ user, actor, requestId }) => {
  await completeOnboarding(actor, user.id, requestId);
  return { ok: true };
});
