import 'server-only';
import type { RecordKind } from '@/features/ai/types';
import type { DemoPersonaId, WorkspacePreferences } from '@/features/preferences/schema';
import type {
  MeetingPrep,
  NotificationsResponse,
  RecordPreview,
  SearchResponse,
  WidgetDataMap,
  WidgetResponse,
} from '@/lib/api/contracts';
import type { ItemState } from '@/server/db/schema';
import type { Actor } from '@/server/security/access-policy';

export type ProviderContext = {
  actor: Actor;
  userId: string;
  // The viewer's own display name ("you" in owner fields and drafts).
  viewerName: string;
  persona: DemoPersonaId;
  preferences: WorkspacePreferences;
  itemStates: Map<string, ItemState>;
  openTaskCount: number;
};

export type ProviderWidgetId = Exclude<keyof WidgetDataMap, 'attention' | 'brief'>;

// One implementation per data mode. Components only ever see the normalized contracts these return.
export interface WorkspaceDataProvider {
  readonly mode: 'demo' | 'production';
  widget<TId extends ProviderWidgetId>(id: TId, context: ProviderContext): Promise<WidgetResponse<WidgetDataMap[TId]>>;
  // Items for Needs Your Attention that come from outside RedSky's own task table.
  externalAttention(context: ProviderContext): Promise<WidgetDataMap['attention']['items']>;
  brief(context: ProviderContext, attentionOpenCount: number): Promise<WidgetResponse<WidgetDataMap['brief']>>;
  record(kind: RecordKind | 'company', id: string, context: ProviderContext): Promise<RecordPreview | null>;
  meetingPrep(meetingId: string, context: ProviderContext): Promise<MeetingPrep | null>;
  search(query: string, context: ProviderContext): Promise<SearchResponse>;
  notifications(context: ProviderContext): Promise<NotificationsResponse>;
}
