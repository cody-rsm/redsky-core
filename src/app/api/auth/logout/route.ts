import { clearSessionCookie, revokeCurrentSession } from '@/server/auth/session';
import { authedRoute } from '@/server/http/api';
import { recordAudit } from '@/server/security/audit';

export const POST = authedRoute(async ({ user }) => {
  await revokeCurrentSession();
  await clearSessionCookie();
  await recordAudit({ actorUserId: user.id, action: 'auth.logout', resourceType: 'session' });
  return { ok: true };
});
