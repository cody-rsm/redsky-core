import 'server-only';
import { eq } from 'drizzle-orm';
import { DEMO_PERSONAS } from '@/demo/personas';
import type { DemoPersonaId } from '@/features/preferences/schema';
import type { AttentionItemView, SearchResponse, WidgetDataMap, WidgetResponse } from '@/lib/api/contracts';
import type { SessionUser } from '@/server/auth/session';
import { getConfig } from '@/server/config/env';
import { getDataProvider } from '@/server/data';
import type { ProviderContext, ProviderWidgetId } from '@/server/data/types';
import { getDb } from '@/server/db/client';
import { employeeProfiles } from '@/server/db/schema';
import type { Actor } from '@/server/security/access-policy';
import { loadItemStates } from './item-state-service';
import { loadPreferencesState } from './preferences-service';
import { listTasks, type TaskRow } from './task-service';

export async function buildProviderContext(user: SessionUser, actor: Actor): Promise<ProviderContext> {
  const config = getConfig();
  const [{ preferences }, profileRows, itemStates] = await Promise.all([
    loadPreferencesState(user.id),
    getDb().select({ firstName: employeeProfiles.firstName, lastName: employeeProfiles.lastName }).from(employeeProfiles).where(eq(employeeProfiles.userId, user.id)).limit(1),
    loadItemStates(user.id, config.dataMode === 'demo' ? 'demo' : 'crm'),
  ]);
  const profile = profileRows[0];
  const viewerName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || user.displayName;
  const fallbackPersona: DemoPersonaId = user.authProvider === 'dev' && user.authSubject in DEMO_PERSONAS ? (user.authSubject as DemoPersonaId) : 'ga';
  return { actor, userId: user.id, viewerName, persona: preferences.demoPersona ?? fallbackPersona, preferences, itemStates, openTaskCount: 0 };
}

export function taskToAttention(task: TaskRow): AttentionItemView {
  const fromMeeting = task.source === 'meeting_prep';
  return {
    key: `task:${task.id}`,
    title: task.title,
    priority: task.priority,
    type: fromMeeting ? 'Follow-up' : 'Task',
    typeIcon: fromMeeting ? 'mail' : 'tasks',
    related: {
      label: task.relatedLabel || 'General',
      record: task.relatedKind && task.relatedId ? { kind: task.relatedKind as NonNullable<AttentionItemView['related']['record']>['kind'], id: task.relatedId } : null,
    },
    due: task.dueOn ? { kind: 'date', on: task.dueOn } : { kind: 'label', label: 'No due date', tone: 'tx', rank: 4 },
    action: 'open',
    actionLabel: 'Open',
    sourceNote: task.sourceNote,
    meetingId: null,
    approval: null,
    ask: null,
    done: task.status === 'done',
  };
}

export async function attentionItems(context: ProviderContext): Promise<AttentionItemView[]> {
  const [tasks, external] = await Promise.all([listTasks(context.actor, context.userId), getDataProvider().externalAttention(context)]);
  return [...tasks.map(taskToAttention), ...external];
}

export async function loadWidget(id: keyof WidgetDataMap, context: ProviderContext): Promise<WidgetResponse<unknown>> {
  if (id === 'attention') return { status: 'ok', sample: getConfig().dataMode === 'demo', data: { items: await attentionItems(context) } };
  if (id === 'brief') {
    const items = await attentionItems(context);
    return getDataProvider().brief(context, items.filter((item) => !item.done).length);
  }
  return getDataProvider().widget(id as ProviderWidgetId, context);
}

export async function searchWorkspace(query: string, context: ProviderContext): Promise<SearchResponse> {
  const [provider, tasks] = await Promise.all([getDataProvider().search(query, context), query.trim() ? listTasks(context.actor, context.userId) : Promise.resolve([])]);
  const needle = query.trim().toLowerCase();
  const taskResults = tasks
    .filter((task) => task.status === 'open' && `${task.title} ${task.relatedLabel}`.toLowerCase().includes(needle))
    .slice(0, 4)
    .map((task) => ({ kind: 'task' as const, id: task.id, label: task.title, sub: task.relatedLabel || 'My Tasks', icon: 'tasks' as const, record: { kind: 'task' as const, id: task.id } }));
  return { results: [...provider.results, ...taskResults], recent: provider.recent };
}
