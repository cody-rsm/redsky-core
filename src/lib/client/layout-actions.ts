'use client';

import { WIDGETS, type LayoutItem, type WidgetId, type WidgetSize } from '@/features/personalization/catalog';
import { useUiStore } from './ui-store';
import { useUpdatePreferences, useViewer } from './viewer';

// Pure layout edits (ported from the prototype's toggleWidget / moveWidget / sizeWidget / dropOn).
export function toggleWidgetIn(layout: LayoutItem[], id: WidgetId): LayoutItem[] {
  if (layout.some((item) => item.id === id)) return layout.filter((item) => item.id !== id);
  if (id === 'brief') return [{ id, size: 12 }, ...layout];
  return [...layout, { id, size: WIDGETS[id].defaultSize }];
}

export function moveWidgetIn(layout: LayoutItem[], id: WidgetId, direction: -1 | 1): LayoutItem[] {
  const from = layout.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= layout.length) return layout;
  const next = [...layout];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

export function resizeWidgetIn(layout: LayoutItem[], id: WidgetId, size: WidgetSize): LayoutItem[] {
  return layout.map((item) => (item.id === id ? { id: item.id, size } : item));
}

export function dropWidgetIn(layout: LayoutItem[], source: WidgetId, target: WidgetId): LayoutItem[] {
  if (source === target) return layout;
  const next = [...layout];
  const from = next.findIndex((item) => item.id === source);
  if (from < 0) return layout;
  const [moved] = next.splice(from, 1);
  const to = next.findIndex((item) => item.id === target);
  if (moved) next.splice(to < 0 ? next.length : to, 0, moved);
  return next;
}

export function useLayoutActions() {
  const viewer = useViewer();
  const update = useUpdatePreferences();
  const toast = useUiStore((state) => state.toast);
  const layout = viewer.layout.layout;
  const save = (next: LayoutItem[]) => update.mutate({ layout: next, layoutTouched: true });
  return {
    layout,
    toggle: (id: WidgetId) => save(toggleWidgetIn(layout, id)),
    move: (id: WidgetId, direction: -1 | 1) => save(moveWidgetIn(layout, id, direction)),
    resize: (id: WidgetId, size: WidgetSize) => save(resizeWidgetIn(layout, id, size)),
    drop: (source: WidgetId, target: WidgetId) => save(dropWidgetIn(layout, source, target)),
    reset: () => {
      update.mutate({ resetLayout: true });
      toast('Home page reset to the recommended layout for your role');
    },
  };
}
