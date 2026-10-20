import { WS_MAX_UPLOAD_BYTES } from '@/features/workstyle/catalog';
import { authedRoute } from '@/server/http/api';
import { badRequest, HttpError } from '@/server/http/errors';
import { uploadAssessment } from '@/server/services/workstyle-service';

export const POST = authedRoute(
  async ({ request, user, actor, requestId }) => {
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > WS_MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, 'too_large', 'Reports can be up to 10 MB');
    const form = await request.formData();
    const file = form.get('report');
    if (!(file instanceof File)) throw badRequest('Choose your report (PDF)');
    if (file.size > WS_MAX_UPLOAD_BYTES) throw badRequest('Reports can be up to 10 MB');
    return uploadAssessment(actor, user.id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, form.get('consent') === 'true', requestId);
  },
  { rateLimit: { name: 'workstyle-upload', capacity: 5, perMinute: 5 } },
);
