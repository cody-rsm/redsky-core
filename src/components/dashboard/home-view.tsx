'use client';

import { useRouter } from 'next/navigation';
import { DensitySegmented, LandingSelect } from '@/components/settings/preference-tabs';
import { Icon } from '@/components/ui/icon';
import { DENSITIES, FULL_WIDTH_TAB_ITEMS, HOME_TAB_WIDGET, type HomeTab, type LayoutItem } from '@/features/personalization/catalog';
import { useLayoutActions } from '@/lib/client/layout-actions';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { dayContext } from '@/lib/client/viewer-display';
import { WIDGET_COMPONENTS } from './widgets';

const TABS: ReadonlyArray<{ id: HomeTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'My Tasks' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'projects', label: 'Projects' },
  { id: 'pipeline', label: 'Pipeline' },
];

export function HomeView({ tab }: { tab: HomeTab }) {
  const viewer = useViewer();
  const router = useRouter();
  const customizingState = useUiStore((state) => state.customizing);
  const { setCustomizing, setLibraryOpen } = useUiStore.getState();
  const { reset } = useLayoutActions();
  const demo = viewer.config.dataMode === 'demo';
  const tabWidget = HOME_TAB_WIDGET[tab];
  const customizing = customizingState && !tabWidget;
  const layout: LayoutItem[] = tabWidget ? [{ id: tabWidget, size: 12 }] : viewer.layout.layout;
  const itemLimit = tabWidget ? FULL_WIDTH_TAB_ITEMS : (DENSITIES.find((density) => density.id === viewer.preferences.density)?.items ?? 4);
  const { todayLabel } = dayContext(viewer);

  const goTab = (next: HomeTab) => {
    if (next !== 'overview') setCustomizing(false);
    router.push(next === 'overview' ? '/home' : `/home?tab=${next}`, { scroll: false });
  };

  const toggleCustomize = () => {
    if (customizing) return setCustomizing(false);
    setCustomizing(true);
    if (tab !== 'overview') router.push('/home', { scroll: false });
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="seg" role="tablist" aria-label="Home views">
          {TABS.map((entry) => (
            <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} onClick={() => goTab(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
        <div className="grow" />
        <span className="faint num hide-sm" style={{ fontSize: 12 }}>
          {todayLabel}
          {demo ? ' · Sample data' : ''}
        </span>
        <button type="button" className="btn btn-sm" onClick={toggleCustomize} aria-pressed={customizing}>
          <Icon name="layout" size="s" />
          {customizing ? 'Done customizing' : 'Customize'}
        </button>
      </div>

      {customizing ? (
        <div className="card a-pop" style={{ padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderColor: 'var(--act)', background: 'var(--acs)' }}>
          <Icon name="layout" style={{ color: 'var(--act)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 200 }} className="grow">
            <span style={{ fontWeight: 600 }}>Customizing your home page</span>
            <span className="muted" style={{ fontSize: 12 }}>
              Drag widgets to reorder, change their size, or hide them. Changes are saved to your account.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="faint" style={{ fontSize: 12 }}>
              Detail
            </span>
            <DensitySegmented />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label className="faint" style={{ fontSize: 12 }} htmlFor="def-view">
              Opens to
            </label>
            <LandingSelect compact />
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setLibraryOpen(true)}>
            <Icon name="plus" size="s" />
            Add widgets
          </button>
          <button type="button" className="btn btn-sm" onClick={reset}>
            <Icon name="refresh" size="s" />
            Reset to recommended
          </button>
          <button type="button" className="btn btn-p btn-sm" onClick={() => setCustomizing(false)}>
            Done
          </button>
        </div>
      ) : null}

      <div className="wgrid">
        {layout.map((item, index) => {
          const Widget = WIDGET_COMPONENTS[item.id];
          return <Widget key={item.id} slot={{ item, index, count: layout.length, customizing, tabMode: Boolean(tabWidget), itemLimit }} />;
        })}
        {customizing ? (
          <button type="button" className="addw wg-4" onClick={() => setLibraryOpen(true)}>
            <Icon name="plus" />
            Add widget
          </button>
        ) : null}
      </div>
      {layout.length === 0 ? (
        <div className="card empty" style={{ marginTop: 8 }}>
          <span className="tile">
            <Icon name="layout" />
          </span>
          <div style={{ fontWeight: 600, color: 'var(--tx)' }}>Your home page is empty</div>
          <button type="button" className="btn btn-sm" onClick={reset}>
            Restore recommended widgets
          </button>
        </div>
      ) : null}
      <div className="faint" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 28, fontSize: 11.5, textAlign: 'center', flexWrap: 'wrap' }}>
        <Icon name="shield" size="xs" />
        <span>
          RedSky shows only records you’re authorized to access.
          {demo ? ' Names, figures and news in demo mode are illustrative sample data.' : ''}
        </span>
      </div>
    </div>
  );
}
