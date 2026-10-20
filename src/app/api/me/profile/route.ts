import { profilePatchSchema } from '@/features/profile/schema';
import { authedRoute, readJson } from '@/server/http/api';
import { updateProfile } from '@/server/services/profile-service';

export const PATCH = authedRoute(async ({ request, user, actor }) => {
  await updateProfile(actor, user.id, profilePatchSchema.parse(await readJson(request)));
  return { ok: true };
});
