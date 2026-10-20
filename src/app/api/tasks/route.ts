import { authedRoute, readJson } from '@/server/http/api';
import { createTasks, taskInputSchema } from '@/server/services/task-service';

export const POST = authedRoute(
  async ({ request, user, actor, requestId }) => {
    const input = taskInputSchema.parse(await readJson(request));
    const [task] = await createTasks(actor, user.id, [input], 'user', 'Created by you', requestId);
    return { ok: true, id: task?.id };
  },
  { rateLimit: { name: 'tasks', capacity: 30, perMinute: 30 } },
);
