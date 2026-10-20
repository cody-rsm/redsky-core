import { authedRoute } from '@/server/http/api';
import { loadViewer } from '@/server/services/viewer-service';

export const GET = authedRoute(async ({ user }) => loadViewer(user));
