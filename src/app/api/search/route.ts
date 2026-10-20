import { authedRoute } from '@/server/http/api';
import { buildProviderContext, searchWorkspace } from '@/server/services/workspace-service';

export const GET = authedRoute(
  async ({ request, user, actor }) => searchWorkspace((request.nextUrl.searchParams.get('q') ?? '').slice(0, 120), await buildProviderContext(user, actor)),
  { rateLimit: { name: 'search', capacity: 60, perMinute: 120 } },
);
