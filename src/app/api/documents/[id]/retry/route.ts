import type { DocumentRow } from '@/lib/api/contracts';
import { authedRoute } from '@/server/http/api';
import { retryDocument } from '@/server/services/document-service';

export const POST = authedRoute<{ id: string }>(async ({ params, actor, requestId }): Promise<DocumentRow> => retryDocument(actor, params.id, requestId), {
  rateLimit: { name: 'document-retry', capacity: 5, perMinute: 10 },
});
