import { contactInputSchema } from '@/features/crm/schema';
import { authedRoute, readJson } from '@/server/http/api';
import { reviewContact } from '@/server/services/crm-write-service';

export const POST = authedRoute(async ({ request, user }) => reviewContact(user.id, contactInputSchema.parse(await readJson(request))), { rateLimit: { name: 'crm-review', capacity: 30, perMinute: 30 } });
