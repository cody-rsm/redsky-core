import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { DEMO_PERSONA_IDS } from '@/features/preferences/schema';
import { provisionDevUser } from '@/server/auth/provisioning';
import { createSession, setSessionCookie } from '@/server/auth/session';
import { getConfig } from '@/server/config/env';
import { errorResponse, handleError, json, readJson } from '@/server/http/api';
import { recordAudit } from '@/server/security/audit';

const bodySchema = z.object({ persona: z.enum(DEMO_PERSONA_IDS) });

// Development-only sign-in. getConfig() never reports mode "dev" in a production build, so this route answers
// 404 there regardless of environment variables.
export async function POST(request: NextRequest) {
  const config = getConfig();
  if (config.auth.mode !== 'dev') return errorResponse(404, 'not_found', 'Not found');
  const origin = request.headers.get('origin');
  if (origin !== (config.appUrl?.origin ?? request.nextUrl.origin)) return errorResponse(403, 'forbidden_origin', 'Request origin not allowed');
  try {
    const { persona } = bodySchema.parse(await readJson(request));
    const userId = await provisionDevUser(persona);
    const session = await createSession(userId);
    await setSessionCookie(session.token, session.expiresAt);
    await recordAudit({ actorUserId: userId, action: 'auth.login', resourceType: 'session', metadata: { provider: 'dev' } });
    return json({ ok: true });
  } catch (error) {
    return handleError(error, request, 'dev-login');
  }
}
