import { authedRoute } from '@/server/http/api';
import { latestConversation } from '@/server/services/ai-service';
import { buildProviderContext } from '@/server/services/workspace-service';

export const GET = authedRoute(async ({ user, actor }) => latestConversation(await buildProviderContext(user, actor)));
