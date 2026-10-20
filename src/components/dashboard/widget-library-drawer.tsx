'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Tile } from '@/components/ui/tile';
import { FOCUS_AREA_SHORT, WIDGET_ORDER, WIDGETS } from '@/features/personalization/catalog';
import { recommend } from '@/features/personalization/recommend';
import { useLayoutActions } from '@/lib/client/layout-actions';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';

// Non-modal (prototype): the grid stays visible and updates live as widgets are switched on and off.
// Esc closes it through the shell's layered escape handler.
export function WidgetLibraryDrawer() {
  const open = useUiStore((state) => state.libraryOpen);
  if (!open) return null;
  return <LibraryPanel />;
}

function LibraryPanel() {
  const viewer = useViewer();
  const { layout, toggle, reset } = useLayoutActions();
  const close = () => useUiStore.getState().setLibraryOpen(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Move focus into the panel once when it opens; it is non-modal, so focus is not trapped afterwards.
  useEffect(() => closeRef.current?.focus(), []);
  const onIds = new Set(layout.map((item) => item.id));
  const recommended = new Set<string>(['brief', ...recommend(viewer.profile.focusAreas, viewer.preferences.goals, viewer.preferences.density).ids]);
  const rolesLabel = viewer.profile.focusAreas.length ? viewer.profile.focusAreas.map((area) => FOCUS_AREA_SHORT[area]).join(', ') : 'your role';

  return (
    <aside
      className="drawer a-slide"
      style={{ width: 'min(390px,100vw)', zIndex: 46 }}
      aria-label="Widget library"
    >
      <header className="dh" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="grow">
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Widget library</h2>
          <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
            Recommended for {rolesLabel}
          </div>
        </div>
        <button ref={closeRef} type="button" className="btn btn-g btn-sm btn-i" aria-label="Close widget library" onClick={close}>
          <Icon name="x" size="s" />
        </button>
      </header>
      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: '8px 12px' }}>
        {WIDGET_ORDER.map((id) => {
          const widget = WIDGETS[id];
          return (
            <div key={id} className="row" style={{ alignItems: 'center' }}>
              <Tile icon={widget.icon} small />
              <div className="grow">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 500 }}>{widget.name}</span>
                  {recommended.has(id) ? (
                    <span className="chip chip-ac" style={{ height: 17, fontSize: 10 }}>
                      Recommended
                    </span>
                  ) : null}
                </div>
                <div className="faint" style={{ fontSize: 12, marginTop: 1 }}>
                  {widget.desc}
                </div>
              </div>
              <Switch checked={onIds.has(id)} label={`Show ${widget.name}`} onCheckedChange={() => toggle(id)} />
            </div>
          );
        })}
      </div>
      <footer className="df">
        <button type="button" className="btn btn-sm" onClick={reset}>
          <Icon name="refresh" size="s" />
          Reset to recommended
        </button>
        <div className="grow" />
        <button type="button" className="btn btn-p btn-sm" onClick={close}>
          Done
        </button>
      </footer>
    </aside>
  );
}
