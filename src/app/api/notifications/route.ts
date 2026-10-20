import { getDataProvider } from '@/server/data';
import { authedRoute } from '@/server/http/api';
import { buildProviderContext } from '@/server/services/workspace-service';

export const GET = authedRoute(async ({ user, actor }) => getDataProvider().notifications(await buildProviderContext(user, actor)));
