import { addContactSchema } from '@/features/crm/schema';
import { authedRoute, readJson } from '@/server/http/api';
import { addContact } from '@/server/services/crm-write-service';

export const POST = authedRoute(async ({ request, user, requestId }) => addContact(user.id, addContactSchema.parse(await readJson(request)), requestId), { rateLimit: { name: 'crm-write', capacity: 20, perMinute: 20 } });
