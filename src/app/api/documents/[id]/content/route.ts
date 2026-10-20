import type { DocumentContentView } from '@/lib/api/contracts';
import { authedRoute } from '@/server/http/api';
import { getDocumentContent } from '@/server/services/document-service';

export const GET = authedRoute<{ id: string }>(async ({ params, actor, requestId }): Promise<DocumentContentView> => getDocumentContent(actor, params.id, requestId), {
  rateLimit: { name: 'document-content', capacity: 30, perMinute: 60 },
});
