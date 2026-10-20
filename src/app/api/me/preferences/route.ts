import { preferencesPatchSchema } from '@/features/preferences/schema';
import { authedRoute, json, readJson } from '@/server/http/api';
import { updatePreferences } from '@/server/services/preferences-service';
import { cookies } from 'next/headers';
import { getConfig } from '@/server/config/env';

export const PATCH = authedRoute(async ({ request, user, actor }) => {
  const patch = preferencesPatchSchema.parse(await readJson(request));
  const state = await updatePreferences(actor, user.id, patch);
  if (patch.theme) {
    // Mirrors the theme into a cookie so the server renders the right theme before any script runs.
    (await cookies()).set('redsky_theme', patch.theme, { httpOnly: false, sameSite: 'lax', secure: getConfig().isProduction, path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  return json({ preferences: state.preferences, layout: state.layout, focusAreas: state.focusAreas });
});
