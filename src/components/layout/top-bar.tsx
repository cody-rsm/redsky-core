'use client';

import { useQuery } from '@tanstack/react-query';
import { DropdownMenu, Popover } from 'radix-ui';
import { usePathname } from 'next/navigation';
import { AvatarButton } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Kbd } from '@/components/ui/kbd';
import { QUICK_ACTIONS } from '@/features/quick-create/catalog';
import type { NotificationsResponse } from '@/lib/api/contracts';
import { apiFetch } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useUpdatePreferences, useViewer } from '@/lib/client/viewer';
import { viewerDisplay } from '@/lib/client/viewer-display';
import { NotificationsPanel } from './notifications-panel';
import { pageMetaFor } from './page-meta';

export function TopBar() {
  const viewer = useViewer();
  const display = viewerDisplay(viewer);
  const pathname = usePathname();
  const meta = pageMetaFor(pathname);
  const aiOpen = useUiStore((state) => state.aiOpen);
  const quickOpen = useUiStore((state) => state.quickOpen);
  const notificationsOpen = useUiStore((state) => state.notificationsOpen);
  const { setPopover, openPalette, setAiOpen, openSettings, openCreate } = useUiStore.getState();
  const updatePreferences = useUpdatePreferences();
  const dark = viewer.preferences.theme === 'dark';
  const themeLabel = dark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <header className="tb">
      <button type="button" className="btn btn-g btn-i tb-menu" onClick={() => setPopover('mobileNav')} aria-label="Open navigation">
        <Icon name="menu" />
      </button>
      <div className="hide-sm" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '0 1 auto' }}>
        <Icon name={meta.icon} className="faint" />
        <span className="ell" style={{ fontWeight: 600 }}>
          {meta.title}
        </span>
        <span className="chip chip-o" title="Internal and confidential">
          <Icon name="lock" size="xs" />
          Internal
        </span>
      </div>
      <button type="button" className="search" onClick={openPalette} aria-label="Search RedSky (Command K)">
        <Icon name="search" />
        <span className="ph grow ell">Search people, companies, deals, documents…</span>
        <Kbd className="hide-sm">⌘</Kbd>
        <Kbd className="hide-sm">K</Kbd>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <DropdownMenu.Root open={quickOpen} onOpenChange={(open) => setPopover(open ? 'quick' : null)} modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="btn btn-sm" aria-haspopup="menu">
              <Icon name="plus" size="s" />
              <span className="hide-sm">New</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="pop pop-r" align="end" sideOffset={4} style={{ width: 250, padding: 6, zIndex: 50 }}>
              <div className="lbl" style={{ padding: '6px 10px 4px' }}>
                Create
              </div>
              {QUICK_ACTIONS.map((action) => (
                <DropdownMenu.Item key={action.type} className="mi" onSelect={() => openCreate(action.type)}>
                  <Icon name={action.icon} className="faint" />
                  <span className="grow">{action.label}</span>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Item className="mi" onSelect={() => setAiOpen(true)}>
                <Icon name="ai" className="faint" />
                <span className="grow">Ask RedSky AI</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <button type="button" className="btn btn-ai btn-sm" onClick={() => setAiOpen(!aiOpen)} aria-pressed={aiOpen} title="Ask RedSky (⌘J)">
          <Icon name="ai" size="s" />
          <span className="hide-sm">Ask RedSky</span>
        </button>
        <Popover.Root open={notificationsOpen} onOpenChange={(open) => setPopover(open ? 'notifications' : null)}>
          <Popover.Trigger asChild>
            <button type="button" className="btn btn-g btn-i" aria-label="Notifications" style={{ position: 'relative' }}>
              <Icon name="bell" />
              <NotificationDot />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="pop pop-r" align="end" sideOffset={6} style={{ width: 'min(370px, calc(100vw - 24px))', zIndex: 50 }}>
              <NotificationsPanel />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <button type="button" className="btn btn-g btn-i hide-sm" aria-label={themeLabel} title={themeLabel} onClick={() => updatePreferences.mutate({ theme: dark ? 'light' : 'dark' })}>
          <Icon name={dark ? 'sun' : 'moon'} />
        </button>
        <button type="button" className="btn btn-g btn-i hide-sm" aria-label="Workspace settings" title="Settings" onClick={() => openSettings('appearance')}>
          <Icon name="sliders" />
        </button>
        <AvatarButton initials={display.initials} tone={display.tone} photoUrl={display.photoUrl} label="Your profile" style={{ marginLeft: 4 }} onClick={() => openSettings('profile')} />
      </div>
    </header>
  );
}

function NotificationDot() {
  const { data } = useQuery({ queryKey: queryKeys.notifications, queryFn: () => apiFetch<NotificationsResponse>('/api/notifications') });
  const unread = data?.status === 'ok' && data.items.some((item) => item.unread);
  if (!unread) return null;
  return <span style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--ac)', boxShadow: '0 0 0 2px var(--sf)' }} />;
}
