import {
  AI_STYLE_IDS,
  DENSITY_IDS,
  type AiStyle,
  type Density,
  type FocusAreaId,
  type GoalId,
  type LayoutItem,
} from '@/features/personalization/catalog';
import { orderLayout, recommend, type LayoutOrderMode } from '@/features/personalization/recommend';
import { PREP_FORMATS, TASK_GROUPS, type DraftTone, type NotifMode, type PrepFormat, type TaskGroup } from '@/features/preferences/schema';
import type { WsRecommendationId } from './catalog';

export type WsRecommendationStatus = 'pending' | 'accepted' | 'dismissed';
export type WsRecommendationState = { status: WsRecommendationStatus; choice: string };
export type WsRecommendationStates = Record<WsRecommendationId, WsRecommendationState>;

// Snapshot of the settings Workstyle may change, taken when the assessment is first processed (SPEC §7.5).
export type WorkstyleBaseline = {
  density: Density;
  layout: LayoutItem[];
  layoutTouched: boolean;
  aiStyle: AiStyle;
  prepFormat: PrepFormat;
  taskGroup: TaskGroup;
  notifMode: NotifMode;
  draftTone: DraftTone;
};

export type WorkstyleEffect = WorkstyleBaseline;

type ApplyInput = {
  baseline: WorkstyleBaseline;
  recommendations: WsRecommendationStates;
  focusAreas: ReadonlyArray<FocusAreaId>;
  goals: ReadonlyArray<GoalId>;
};

const isOneOf = <TValue extends string>(values: ReadonlyArray<TValue>, value: string): value is TValue => (values as ReadonlyArray<string>).includes(value);

// Effective settings = baseline + every accepted recommendation, applied in a fixed order
// (density → layout → AI → prep → tasks → communication). Turning one off therefore restores the baseline value.
export function wsApply({ baseline, recommendations, focusAreas, goals }: ApplyInput): WorkstyleEffect {
  const accepted = (id: WsRecommendationId) => recommendations[id].status === 'accepted';
  const out: WorkstyleEffect = { ...baseline, layout: [...baseline.layout] };

  const density = recommendations.density.choice;
  if (accepted('density') && isOneOf(DENSITY_IDS, density)) {
    out.density = density;
    out.layout = recommend(focusAreas, goals, density).layout;
    out.layoutTouched = false;
  }
  const layoutMode = recommendations.layout.choice;
  if (accepted('layout') && layoutMode !== 'keep' && (layoutMode === 'action' || layoutMode === 'people')) {
    out.layout = orderLayout(out.layout, layoutMode satisfies LayoutOrderMode);
    out.layoutTouched = true;
  }
  const aiStyle = recommendations.ai.choice;
  if (accepted('ai') && isOneOf(AI_STYLE_IDS, aiStyle)) out.aiStyle = aiStyle;
  const prep = recommendations.prep.choice;
  if (accepted('prep') && isOneOf(PREP_FORMATS, prep)) out.prepFormat = prep;
  const tasks = recommendations.tasks.choice;
  if (accepted('tasks') && isOneOf(TASK_GROUPS, tasks)) out.taskGroup = tasks;
  if (accepted('comm')) {
    const comm = recommendations.comm.choice;
    out.notifMode = comm === 'realtime' ? 'realtime' : 'batched';
    out.draftTone = comm === 'warm' ? 'warm' : 'direct';
  }
  return out;
}

export function acceptAllPending(recommendations: WsRecommendationStates): WsRecommendationStates {
  const out = { ...recommendations };
  for (const id of Object.keys(out) as WsRecommendationId[]) {
    if (out[id].status === 'pending') out[id] = { ...out[id], status: 'accepted' };
  }
  return out;
}
