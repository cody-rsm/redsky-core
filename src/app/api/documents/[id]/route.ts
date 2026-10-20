import type { DocumentRow } from '@/lib/api/contracts';
import { authedRoute } from '@/server/http/api';
import { deleteDocument, getDocument } from '@/server/services/document-service';

type Params = { id: string };

export const GET = authedRoute<Params>(async ({ params, actor }): Promise<DocumentRow> => getDocument(actor, params.id));

export const DELETE = authedRoute<Params>(async ({ params, actor, requestId }) => {
  await deleteDocument(actor, params.id, requestId);
  return { ok: true };
});
