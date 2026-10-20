'use client';

import type { KeyboardEvent } from 'react';
import { Icon } from '@/components/ui/icon';
import { DENSITIES, FOCUS_AREA_SHORT, GOALS, WIDGET_ORDER, WIDGETS, type WidgetId } from '@/features/personalization/catalog';
import { recommend } from '@/features/personalization/recommend';
import { useLayoutActions } from '@/lib/client/layout-actions';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { WidgetMiniPreview } from '../widget-mini-preview';

export function HomeBuilderStep() {
  const viewer = useViewer();
  const { layout, toggle, move, drop, reset } = useLayoutActions();
  const drag = useUiStore((state) => state.drag);
  const setDrag = useUiStore.getState().setDrag;
  const { focusAreas } = viewer.profile;
  const { goals, density } = viewer.preferences;
  const onIds = new Set(layout.map((item) => item.id));
  const recommended = new Set<WidgetId>(['brief', ...recommend(focusAreas, goals, density).ids]);
  const rolesLabel = focusAreas.length ? focusAreas.map((area) => FOCUS_AREA_SHORT[area]).join(', ') : 'your role';
  const goalText = goals
    .slice(0, 2)
    .map((goal) => GOALS.find((entry) => entry.id === goal)?.label.toLowerCase() ?? goal)
    .join(' and ');
  const densityLabel = DENSITIES.find((entry) => entry.id === density)?.label ?? 'Balanced';
  const recNote = `Recommended for ${rolesLabel}${goalText ? `, weighted toward ${goalText}` : ''}. ${densityLabel} detail.`;

  // Keyboard alternative to dragging: Alt+Arrow moves the focused block earlier or later.
  const onBlockKey = (event: KeyboardEvent<HTMLDivElement>, id: WidgetId) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(id, -1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(id, 1);
    }
  };

  return (
    <div className="ob-inner a-in" style={{ maxWidth: 1180 }}>
      <span className="lbl">Step 8 · Home page</span>
      <h1 className="ob-h serif">Build your home page</h1>
      <p className="ob-sub">We’ve recommended widgets for {rolesLabel} based on your answers. Turn widgets on or off, then drag blocks in the preview to reorder.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 26, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 520px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(230px,100%),1fr))', gap: 12 }}>
          {WIDGET_ORDER.map((id) => {
            const widget = WIDGETS[id];
            const on = onIds.has(id);
            return (
              <div key={id} className="card" style={{ overflow: 'hidden', opacity: on ? 1 : 0.62, transition: 'opacity .2s,border-color .2s', borderColor: on ? 'var(--bd2)' : 'var(--bd)' }}>
                <WidgetMiniPreview kind={widget.previewKind} />
                <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Icon name={widget.icon} style={{ marginTop: 2, color: 'var(--tx3)' }} />
                  <div className="grow">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{widget.name}</span>
                      {recommended.has(id) ? (
                        <span className="chip chip-ac" style={{ height: 18, fontSize: 10.5 }}>
                          Recommended
                        </span>
                      ) : null}
                    </div>
                    <div className="faint" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.4 }}>
                      {widget.desc}
                    </div>
                  </div>
                  <button type="button" className="sw" role="switch" aria-checked={on} aria-label={`Show ${widget.name}`} onClick={() => toggle(id)} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ flex: '1 1 340px', position: 'sticky', top: 0 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>Live preview</span>
              <span className="chip">{layout.length} widgets</span>
              <div className="grow" />
              <button type="button" className="btn btn-g btn-sm" onClick={reset}>
                <Icon name="refresh" size="s" />
                Reset
              </button>
            </div>
            <p className="faint" style={{ fontSize: 12, marginBottom: 12 }}>
              Drag blocks to reorder (or focus one and press Alt + arrow keys). Sizes can be changed later in customize mode.
            </p>
            <div style={{ border: '1px solid var(--bd)', borderRadius: 10, background: 'var(--bg)', padding: 10 }}>
              <div className="mg" role="list" aria-label="Home page layout preview">
                {layout.map((item) => (
                  <div
                    key={item.id}
                    role="listitem"
                    tabIndex={0}
                    className={item.id === 'brief' ? `mb mg-${item.size} mb-brief` : `mb mg-${item.size}`}
                    data-over={drag.over === item.id && drag.id !== item.id}
                    draggable
                    title={WIDGETS[item.id].name}
                    aria-label={`${WIDGETS[item.id].name}. Alt + arrow keys to move.`}
                    onKeyDown={(event) => onBlockKey(event, item.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', item.id);
                      setDrag({ id: item.id, over: null });
                    }}
                    onDragOver={(event) => {
                      if (!drag.id) return;
                      event.preventDefault();
                      if (drag.over !== item.id) setDrag({ id: drag.id, over: item.id });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (drag.id && drag.id !== item.id) drop(drag.id as WidgetId, item.id);
                      setDrag({ id: null, over: null });
                    }}
                    onDragEnd={() => setDrag({ id: null, over: null })}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name={WIDGETS[item.id].icon} size="xs" style={{ flex: 'none' }} />
                      <span className="ell">{WIDGETS[item.id].name}</span>
                    </span>
                    <span className="sk" style={{ width: '70%', height: 4 }} />
                    <span className="sk" style={{ width: '45%', height: 4 }} />
                  </div>
                ))}
              </div>
              {layout.length === 0 ? (
                <div className="faint" style={{ fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
                  Turn on at least one widget.
                </div>
              ) : null}
            </div>
            <div className="note" style={{ marginTop: 12, fontSize: 12 }}>
              <Icon name="ai" size="s" style={{ marginTop: 1, color: 'var(--act)' }} />
              <span>{recNote}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
