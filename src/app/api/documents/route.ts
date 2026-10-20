import { z } from 'zod';
import { DOCUMENT_MAX_BYTES } from '@/features/documents/catalog';
import type { DocumentListResponse, DocumentRow } from '@/lib/api/contracts';
import { authedRoute } from '@/server/http/api';
import { badRequest, HttpError } from '@/server/http/errors';
import { listDocuments, uploadDocument } from '@/server/services/document-service';

const optionsSchema = z.object({
  visibility: z.enum(['private', 'firm']),
  related: z.string().trim().max(200).default(''),
});

export const GET = authedRoute(async ({ request, actor }): Promise<DocumentListResponse> => listDocuments(actor, request.nextUrl.searchParams.get('cursor')));

export const POST = authedRoute(
  async ({ request, actor, requestId }): Promise<DocumentRow> => {
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > DOCUMENT_MAX_BYTES + 64 * 1024) throw new HttpError(413, 'too_large', 'Files can be up to 50 MB.');
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw badRequest('Choose a file to upload');
    if (file.size > DOCUMENT_MAX_BYTES) throw new HttpError(413, 'too_large', 'Files can be up to 50 MB.');
    const options = optionsSchema.parse({ visibility: form.get('visibility'), related: form.get('related') ?? undefined });
    return uploadDocument(actor, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, { visibility: options.visibility, relatedLabel: options.related }, requestId);
  },
  { rateLimit: { name: 'document-upload', capacity: 10, perMinute: 20 } },
);
