'use client';

import type { DragEvent, ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { Tile } from '@/components/ui/tile';
import { WIDGETS, type LayoutItem, type WidgetSize } from '@/features/personalization/catalog';
import { useLayoutActions } from '@/lib/client/layout-actions';
import { useUiStore } from '@/lib/client/ui-store';

// Where a widget sits and how much it shows; passed to every widget component by the home grid.
export type WidgetSlot = {
  item: LayoutItem;
  index: number;
  count: number;
  customizing: boolean;
  // A single full-width widget on a Home tab (My Tasks, Relationships, …).
  tabMode: boolean;
  itemLimit: number;
};

const SIZE_OPTIONS: ReadonlyArray<{ size: WidgetSize; label: string; title: string }> = [
  { size: 4, label: 'S', title: 'Small — one third' },
  { size: 6, label: 'M', title: 'Medium — half' },
  { size: 8, label: 'L', title: 'Large — two thirds' },
  { size: 12, label: 'XL', title: 'Full width' },
];

type WidgetFrameProps = {
  slot: WidgetSlot;
  sub?: string;
  sample?: boolean;
  more?: { label: string; onClick: () => void } | null;
  // The brief renders its own hero instead of the standard header (except while customizing).
  headless?: boolean;
  children: ReactNode;
};

export function WidgetFrame({ slot, sub, sample, more, headless, children }: WidgetFrameProps) {
  const { item, index, count, customizing, tabMode } = slot;
  const widget = WIDGETS[item.id];
  const drag = useUiStore((state) => state.drag);
  const { move, resize, toggle, drop } = useLayoutActions();
  const setDrag = useUiStore.getState().setDrag;
  const size = tabMode ? 12 : item.size;

  const dragProps = customizing
    ? {
        draggable: true,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', item.id);
          setDrag({ id: item.id, over: null });
        },
        onDragOver: (event: DragEvent<HTMLElement>) => {
          if (!drag.id) return;
          event.preventDefault();
          if (drag.over !== item.id) setDrag({ id: drag.id, over: item.id });
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          event.preventDefault();
          if (drag.id && drag.id !== item.id) drop(drag.id as LayoutItem['id'], item.id);
          setDrag({ id: null, over: null });
        },
        onDragEnd: () => setDrag({ id: null, over: null }),
      }
    : {};

  return (
    <section className={`wc wg-${size}`} data-edit={customizing} data-over={drag.over === item.id && drag.id !== item.id} data-dragging={drag.id === item.id} aria-label={widget.name} {...dragProps}>
      {!headless || customizing ? (
        <header className="wh">
          {customizing ? (
            <span className="faint" title="Drag to reorder" style={{ display: 'flex' }}>
              <Icon name="grip" />
            </span>
          ) : null}
          <Tile icon={widget.icon} small />
          <h2>{widget.name}</h2>
          {sub ? (
            <span className="faint num ell" style={{ fontSize: 12 }}>
              {sub}
            </span>
          ) : null}
          <div className="grow" />
          {sample ? <span className="chip chip-o hide-sm">Sample data</span> : null}
          {customizing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <div className="seg seg-sm" role="group" aria-label={`${widget.name} width`}>
                {SIZE_OPTIONS.map((option) => (
                  <button key={option.size} type="button" aria-pressed={item.size === option.size} title={option.title} onClick={() => resize(item.id, option.size)}>
                    {option.label}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-g btn-sm btn-i" aria-label={`Move ${widget.name} earlier`} onClick={() => move(item.id, -1)} disabled={index === 0}>
                <Icon name="up" size="s" />
              </button>
              <button type="button" className="btn btn-g btn-sm btn-i" aria-label={`Move ${widget.name} later`} onClick={() => move(item.id, 1)} disabled={index === count - 1}>
                <Icon name="down" size="s" />
              </button>
              <button type="button" className="btn btn-g btn-sm btn-i" aria-label={`Hide ${widget.name}`} onClick={() => toggle(item.id)}>
                <Icon name="eyeOff" size="s" />
              </button>
            </div>
          ) : null}
          {!customizing && !tabMode && more ? (
            <button type="button" className="btn btn-g btn-sm" onClick={more.onClick}>
              {more.label}
              <Icon name="chevR" size="xs" />
            </button>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
