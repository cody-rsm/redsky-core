import { addNoteSchema } from '@/features/crm/schema';
import { authedRoute, readJson } from '@/server/http/api';
import { addNote } from '@/server/services/crm-write-service';

export const POST = authedRoute(async ({ request, user, requestId }) => addNote(user.id, addNoteSchema.parse(await readJson(request)), requestId), { rateLimit: { name: 'crm-write', capacity: 20, perMinute: 20 } });
