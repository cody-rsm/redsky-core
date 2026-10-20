import { workstyleProfileSchema } from '@/features/workstyle/profile';
import { authedRoute, readJson } from '@/server/http/api';
import { submitReview } from '@/server/services/workstyle-service';

export const POST = authedRoute(async ({ request, user, actor, requestId }) => submitReview(actor, user.id, workstyleProfileSchema.parse(await readJson(request)), requestId));
