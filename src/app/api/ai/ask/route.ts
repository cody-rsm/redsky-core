import { authedRoute, readJson } from '@/server/http/api';
import { askAi, askSchema } from '@/server/services/ai-service';
import { buildProviderContext } from '@/server/services/workspace-service';

export const POST = authedRoute(
  async ({ request, user, actor }) => askAi(await buildProviderContext(user, actor), askSchema.parse(await readJson(request, 16 * 1024))),
  { rateLimit: { name: 'ai', capacity: 15, perMinute: 15 } },
);
