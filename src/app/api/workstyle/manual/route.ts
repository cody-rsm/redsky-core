import { z } from 'zod';
import { authedRoute, readJson } from '@/server/http/api';
import { startManualAssessment } from '@/server/services/workstyle-service';

export const POST = authedRoute(async ({ request, user, actor, requestId }) => startManualAssessment(actor, user.id, z.object({ consent: z.boolean() }).parse(await readJson(request)).consent, requestId));
