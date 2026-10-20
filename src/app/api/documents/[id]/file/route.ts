import { authedRoute } from '@/server/http/api';
import { openOriginal } from '@/server/services/document-service';

// Always a download, never rendered in RedSky's origin: an uploaded file is untrusted content.
export const GET = authedRoute<{ id: string }>(
  async ({ params, actor, requestId }) => {
    const { object, fileName, mimeType } = await openOriginal(actor, params.id, requestId);
    const fallbackName = fileName.replace(/[^A-Za-z0-9._-]+/g, '_') || 'document';
    return new Response(object.body, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        ...(object.contentLength !== null ? { 'Content-Length': String(object.contentLength) } : {}),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  },
  { rateLimit: { name: 'document-file', capacity: 20, perMinute: 30 } },
);
