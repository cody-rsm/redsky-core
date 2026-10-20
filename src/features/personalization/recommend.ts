import {
  BASE_WIDGET_ORDER,
  DENSITIES,
  FOCUS_AREA_WIDGET_WEIGHTS,
  GOAL_WIDGET_WEIGHTS,
  NARROW_WIDGETS,
  WIDE_WIDGETS,
  type Density,
  type FocusAreaId,
  type GoalId,
  type LayoutItem,
  type RankedWidgetId,
  type WidgetId,
} from './catalog';

export type Recommendation = { ids: RankedWidgetId[]; layout: LayoutItem[] };

const FIXED_BONUS: Partial<Record<RankedWidgetId, number>> = { attention: 3, meetings: 2, airecs: 1 };

// SPEC §5.3. Scores every widget from focus areas and goals, keeps N by density, pins Needs Your Attention
// (and Today's Meetings when it made the cut) first, packs sizes into rows and puts the Daily Brief on top.
export function recommend(focusAreas: ReadonlyArray<FocusAreaId>, goals: ReadonlyArray<GoalId>, density: Density): Recommendation {
  const score = new Map<RankedWidgetId, number>(BASE_WIDGET_ORDER.map((id) => [id, 0]));
  const add = (id: RankedWidgetId, points: number) => score.set(id, (score.get(id) ?? 0) + points);

  for (const area of focusAreas) {
    FOCUS_AREA_WIDGET_WEIGHTS[area].forEach((id, index) => add(id, index === 0 ? 8 : 6 - index));
  }
  for (const goal of goals) {
    GOAL_WIDGET_WEIGHTS[goal].forEach((id) => add(id, 4));
  }
  for (const [id, bonus] of Object.entries(FIXED_BONUS) as Array<[RankedWidgetId, number]>) add(id, bonus);

  const order = [...BASE_WIDGET_ORDER].sort(
    (a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || BASE_WIDGET_ORDER.indexOf(a) - BASE_WIDGET_ORDER.indexOf(b),
  );
  const count = widgetCountFor(density);
  const top = order.slice(0, count);
  const head: RankedWidgetId[] = ['attention'];
  if (top.includes('meetings')) head.push('meetings');
  const ids = head.concat(top.filter((id) => !head.includes(id))).slice(0, Math.max(count, head.length));

  return { ids, layout: [{ id: 'brief', size: 12 }, ...pack(ids)] };
}

export function widgetCountFor(density: Density): number {
  return DENSITIES.find((entry) => entry.id === density)?.widgets ?? 8;
}

// Pairs widgets into rows: wide + narrow → 8 + 4 (either order), any other pair → 6 + 6, a leftover → 12.
export function pack(ids: ReadonlyArray<WidgetId>): LayoutItem[] {
  const out: LayoutItem[] = [];
  for (let index = 0; index < ids.length; index += 2) {
    const first = ids[index];
    const second = ids[index + 1];
    if (first === undefined) break;
    if (second === undefined) {
      out.push({ id: first, size: 12 });
      break;
    }
    if (WIDE_WIDGETS.has(first) && NARROW_WIDGETS.has(second)) out.push({ id: first, size: 8 }, { id: second, size: 4 });
    else if (NARROW_WIDGETS.has(first) && WIDE_WIDGETS.has(second)) out.push({ id: first, size: 4 }, { id: second, size: 8 });
    else out.push({ id: first, size: 6 }, { id: second, size: 6 });
  }
  return out;
}

export type LayoutOrderMode = 'action' | 'people' | 'keep';

const ORDER_PRIORITY: Record<Exclude<LayoutOrderMode, 'keep'>, ReadonlyArray<WidgetId>> = {
  action: ['attention', 'approvals', 'meetings'],
  people: ['relationships', 'meetings', 'attention'],
};
const BACKGROUND_READING: ReadonlyArray<WidgetId> = ['intel', 'team', 'documents', 'portfolio'];

// Workstyle "Dashboard layout" recommendation (SPEC §7.4): action-first or people-first ordering,
// background reading last, then re-packed. "keep" leaves the layout untouched.
export function orderLayout(layout: ReadonlyArray<LayoutItem>, mode: LayoutOrderMode): LayoutItem[] {
  if (mode === 'keep') return [...layout];
  const priority = ORDER_PRIORITY[mode];
  const rank = (id: WidgetId) => {
    const first = priority.indexOf(id);
    if (first >= 0) return first;
    const last = BACKGROUND_READING.indexOf(id);
    return last >= 0 ? 100 + last : 50;
  };
  const rest = layout
    .filter((item) => item.id !== 'brief')
    .map((item, index) => ({ id: item.id, index }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.index - b.index)
    .map((item) => item.id);
  const head: LayoutItem[] = layout.some((item) => item.id === 'brief') ? [{ id: 'brief', size: 12 }] : [];
  return head.concat(pack(rest));
}
