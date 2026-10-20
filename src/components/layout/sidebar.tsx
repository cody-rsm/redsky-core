'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Avatar, AvatarButton } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { RedSkyMark } from '@/components/ui/redsky-mark';
import { hrefForNav, NAV_BOTTOM, visibleNavGroups, type NavBottomId, type NavItemId } from '@/features/navigation/catalog';
import { landingHref } from '@/features/navigation/landing';
import { useUiStore } from '@/lib/client/ui-store';
import { useUpdatePreferences, useViewer } from '@/lib/client/viewer';
import { viewerDisplay } from '@/lib/client/viewer-display';
import { useWidget } from '@/lib/client/use-widget';

export function Sidebar() {
  const viewer = useViewer();
  const display = viewerDisplay(viewer);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const groupsClosed = useUiStore((state) => state.groupsClosed);
  const showAll = useUiStore((state) => state.showAllModules);
  const aiOpen = useUiStore((state) => state.aiOpen);
  const { toggleGroup, toggleAllModules, setAiOpen, openSettings, setPopover } = useUiStore.getState();
  const updatePreferences = useUpdatePreferences();
  const attention = useWidget('attention');
  const openTasks = attention.data?.status === 'ok' ? attention.data.data.items.filter((item) => !item.done).length : null;
  const collapsed = viewer.preferences.sidebar === 'collapsed';
  const { groups, hiddenCount } = visibleNavGroups(viewer.profile.focusAreas, showAll);

  function go(id: NavItemId | NavBottomId) {
    setPopover(null);
    if (id === 'ai') return setAiOpen(true);
    if (id === 'settings') return openSettings('appearance');
    if (id === 'integrations') return openSettings('apps');
    if (id === 'home') return router.push(landingHref(viewer.preferences.landing));
    const href = hrefForNav(id);
    if (href) router.push(href);
  }

  function isCurrent(id: NavItemId | NavBottomId): boolean {
    if (id === 'home') return pathname === '/home' && tab !== 'tasks';
    if (id === 'tasks') return pathname === '/home' && tab === 'tasks';
    if (id === 'ai') return aiOpen;
    if (id === 'people' || id === 'pipeline') return pathname === `/${id}`;
    return pathname === `/m/${id}`;
  }

  function badgeFor(badge: 'inbox' | 'tasks' | undefined): string | null {
    if (badge === 'tasks') return openTasks ? String(openTasks) : null;
    // The Inbox count is sample content; production has no inbox source yet.
    if (badge === 'inbox') return viewer.config.dataMode === 'demo' ? '3' : null;
    return null;
  }

  return (
    <aside className="sb" aria-label="Primary navigation">
      <div className="sb-top">
        <button type="button" className="ws" onClick={() => go('home')} aria-label="RedSky home">
          <RedSkyMark size={28} />
          <span className="nl" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, textAlign: 'left' }}>
            <span className="serif" style={{ fontSize: 18 }}>
              RedSky
            </span>
            <span style={{ fontSize: 9.5, color: 'var(--tx3)', letterSpacing: '.14em', marginTop: 2 }}>RSM CAPITAL</span>
          </span>
        </button>
        <div className="grow nl" />
        <AvatarButton className="nl" size="sm" initials={display.initials} tone={display.tone} photoUrl={display.photoUrl} label="Your profile" title={display.fullName} onClick={() => openSettings('profile')} />
        <button
          type="button"
          className="btn btn-g btn-sm btn-i"
          onClick={() => updatePreferences.mutate({ sidebar: collapsed ? 'full' : 'collapsed' })}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name="sidebar" size="s" />
        </button>
      </div>
      <nav className="sb-scroll scroll" aria-label="Modules">
        {groups.map((group) => {
          const open = collapsed || !groupsClosed[group.id];
          return (
            <div className="ng" key={group.id}>
              <button type="button" className="ng-h" onClick={() => toggleGroup(group.id)} aria-expanded={open}>
                <span className="nl grow">{group.label}</span>
                <Icon name="chevD" size="xs" className="nl" style={{ transform: `rotate(${open ? '0deg' : '-90deg'})`, transition: 'transform .15s' }} />
              </button>
              {open ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2 }}>
                  {group.items.map((item) => {
                    const badge = badgeFor(item.badge);
                    return (
                      <button key={item.id} type="button" className="ni" aria-current={isCurrent(item.id) ? 'page' : undefined} onClick={() => go(item.id)} title={item.label}>
                        <Icon name={item.icon} />
                        <span className="nl ell">{item.label}</span>
                        {badge ? <span className="badge nl">{badge}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {hiddenCount > 0 ? (
          <button type="button" className="ni" style={{ marginTop: 12, color: 'var(--tx3)' }} onClick={toggleAllModules} title={showAll ? 'Show modules for my role' : `Show ${hiddenCount} more modules`}>
            <Icon name="grid" />
            <span className="nl ell" style={{ fontSize: 12 }}>
              {showAll ? 'Show modules for my role' : `Show ${hiddenCount} more modules`}
            </span>
          </button>
        ) : null}
      </nav>
      <div className="sb-bot">
        {NAV_BOTTOM.map((item) => (
          <button key={item.id} type="button" className="ni" aria-current={item.id === 'help' && pathname === '/m/help' ? 'page' : undefined} onClick={() => (item.id === 'help' ? router.push('/m/help') : go(item.id))} title={item.label}>
            <Icon name={item.icon} />
            <span className="nl">{item.label}</span>
          </button>
        ))}
        <button type="button" className="ni" style={{ height: 44, marginTop: 4 }} onClick={() => openSettings('profile')} title="Profile">
          <Avatar initials={display.initials} tone={display.tone} size="sm" photoUrl={display.photoUrl} />
          <span className="nl" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0, textAlign: 'left' }}>
            <span className="ell" style={{ fontWeight: 500, color: 'var(--tx)' }}>
              {display.fullName}
            </span>
            <span className="ell" style={{ fontSize: 11, color: 'var(--tx3)' }}>
              {display.title}
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
