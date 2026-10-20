import { z } from 'zod';
import { authedRoute, readJson } from '@/server/http/api';
import { confirmAction } from '@/server/services/confirm-service';
import { buildProviderContext } from '@/server/services/workspace-service';

const originSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ai_message'), messageId: z.string().uuid(), actionIndex: z.number().int().min(0).max(20) }),
  z.object({ type: z.literal('recommendation'), id: z.string().max(40) }),
  z.object({ type: z.literal('meeting_followups'), meetingId: z.string().max(40) }),
  z.object({ type: z.literal('approval'), id: z.string().max(40) }),
]);

export const POST = authedRoute(
  async ({ request, user, actor, requestId }) => confirmAction(await buildProviderContext(user, actor), originSchema.parse(await readJson(request)), requestId),
  { rateLimit: { name: 'confirm', capacity: 20, perMinute: 20 } },
);
