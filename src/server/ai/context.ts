import 'server-only';
import { FOCUS_AREA_SHORT } from '@/features/personalization/catalog';
import { describeDue, todayIn } from '@/lib/dates/due';
import { getConfig } from '@/server/config/env';
import type { ProviderContext } from '@/server/data/types';
import { listTasks } from '@/server/services/task-service';
import { loadPreferencesState } from '@/server/services/preferences-service';

export type RetrievedContext = { serialized: string; taskIds: Set<string>; taskTitles: Map<string, string> };

// Permission-scoped retrieval: only data the requesting employee owns in RedSky. When CRM, calendar or document
// sources are connected, their adapters must be queried here with the same actor so the AI never sees more than
// the employee could open themselves.
export async function retrieveContext(context: ProviderContext): Promise<RetrievedContext> {
  const config = getConfig();
  const [tasks, state] = await Promise.all([listTasks(context.actor, context.userId), loadPreferencesState(context.userId)]);
  const today = todayIn(config.timeZone);
  const open = tasks.filter((task) => task.status === 'open').slice(0, 50);
  const payload = {
    today,
    timeZone: config.timeZone,
    employee: { name: context.viewerName, focusAreas: state.focusAreas.map((area) => FOCUS_AREA_SHORT[area]) },
    openTasks: open.map((task) => ({ id: task.id, title: task.title, related: task.relatedLabel || null, due: task.dueOn ? describeDue(task.dueOn, today).label : null, priority: task.priority })),
    notConnected: ['Outlook email', 'Outlook calendar', 'Microsoft Teams', 'OneDrive / SharePoint', ...(config.crm.provider === 'twenty' ? [] : ['RSM CRM']), 'Research and market-data providers'],
  };
  return {
    serialized: JSON.stringify(payload),
    taskIds: new Set(open.map((task) => task.id)),
    taskTitles: new Map(open.map((task) => [task.id, task.title])),
  };
}
