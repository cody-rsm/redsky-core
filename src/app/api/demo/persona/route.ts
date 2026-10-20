import { z } from 'zod';
import { DEMO_PERSONA_IDS } from '@/features/preferences/schema';
import { provisionDevUser } from '@/server/auth/provisioning';
import { createSession, revokeCurrentSession, setSessionCookie } from '@/server/auth/session';
import { getConfig } from '@/server/config/env';
import { authedRoute, readJson } from '@/server/http/api';
import { notFound } from '@/server/http/errors';
import { updatePreferences } from '@/server/services/preferences-service';

// Demo profile switcher (SPEC §5.4). With development sign-in it signs in as that persona; otherwise it only
// changes which sample dataset the signed-in employee is looking at.
export const POST = authedRoute(async ({ request, user, actor }) => {
  const config = getConfig();
  if (config.dataMode !== 'demo') throw notFound('Not found');
  const { persona } = z.object({ persona: z.enum(DEMO_PERSONA_IDS) }).parse(await readJson(request));
  if (config.auth.mode === 'dev' && user.authProvider === 'dev') {
    const userId = await provisionDevUser(persona);
    await revokeCurrentSession();
    const session = await createSession(userId);
    await setSessionCookie(session.token, session.expiresAt);
    return { ok: true, switchedUser: true };
  }
  await updatePreferences(actor, user.id, { demoPersona: persona });
  return { ok: true, switchedUser: false };
});
