import type { DocumentSearchResponse } from '@/lib/api/contracts';
import { authedRoute } from '@/server/http/api';
import { searchDocuments } from '@/server/services/document-service';

export const GET = authedRoute(async ({ request, actor }): Promise<DocumentSearchResponse> => searchDocuments(actor, (request.nextUrl.searchParams.get('q') ?? '').slice(0, 200)), {
  rateLimit: { name: 'document-search', capacity: 20, perMinute: 40 },
});
