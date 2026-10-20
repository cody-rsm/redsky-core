import { z } from 'zod';
import { authedRoute, readJson } from '@/server/http/api';
import { goToStep } from '@/server/services/onboarding-service';

const bodySchema = z.object({ step: z.number().int().min(0).max(8) });

export const PUT = authedRoute(async ({ request, user, actor }) => goToStep(actor, user.id, bodySchema.parse(await readJson(request)).step));
