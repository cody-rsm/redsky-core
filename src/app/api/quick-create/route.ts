import { z } from 'zod';
import { CREATE_DEFINITIONS } from '@/features/quick-create/catalog';
import { getConfig } from '@/server/config/env';
import { authedRoute, readJson } from '@/server/http/api';
import { unavailable } from '@/server/http/errors';

const bodySchema = z.object({
  type: z.enum(['contact', 'meeting', 'opportunity', 'document']),
  title: z.string().trim().min(1).max(300),
  related: z.string().trim().max(200).optional(),
  extra: z.string().trim().max(60).optional(),
});

const UNAVAILABLE: Record<z.infer<typeof bodySchema>['type'], string> = {
  contact: 'Adding contacts needs the RSM CRM connection, which is not set up yet.',
  meeting: 'Logging meetings needs the RSM CRM connection, which is not set up yet.',
  opportunity: 'Adding opportunities needs the CRM deal model, which arrives in Phase 3.',
  document: 'Uploading documents needs OneDrive / SharePoint, which is not connected yet.',
};

// Creates that write to systems RedSky does not own. Demo mode simulates them (labelled); production refuses
// honestly until the system is connected. Tasks and research are RedSky-native and use their own endpoints.
export const POST = authedRoute(async ({ request }) => {
  const body = bodySchema.parse(await readJson(request));
  if (getConfig().dataMode !== 'demo') throw unavailable(UNAVAILABLE[body.type]);
  const messages: Record<typeof body.type, string> = {
    contact: `${body.title} submitted for review — duplicates are checked first`,
    meeting: `Meeting logged${body.related ? ` to ${body.related}` : ''}`,
    opportunity: `${body.title} added to ${body.extra || 'Sourcing'} (sample)`,
    document: `${body.title} uploaded (simulated)`,
  };
  return { ok: true, simulated: true, message: messages[body.type], label: CREATE_DEFINITIONS[body.type].title };
});
