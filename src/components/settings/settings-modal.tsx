'use client';

import { Modal, DialogTitle } from '@/components/ui/dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import { useUiStore, type SettingsTab } from '@/lib/client/ui-store';
import { MyWorkstyle } from '@/components/workstyle/my-workstyle';
import { AiSettingsTab, AppearanceTab, ConnectedAppsTab, HomePageTab, NotificationsTab } from './preference-tabs';
import { ProfileTab } from './profile-tab';

const TABS: ReadonlyArray<{ id: SettingsTab; label: string; icon: IconName }> = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'workstyle', label: 'My Workstyle', icon: 'compass' },
  { id: 'appearance', label: 'Appearance', icon: 'sun' },
  { id: 'home', label: 'Home page', icon: 'layout' },
  { id: 'ai', label: 'RedSky AI', icon: 'ai' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'apps', label: 'Connected apps', icon: 'plug' },
];

export function SettingsModal() {
  const tab = useUiStore((state) => state.settingsTab);
  const { openSettings, closeSettings } = useUiStore.getState();
  const current = TABS.find((entry) => entry.id === tab);
  return (
    <Modal open={Boolean(tab)} onOpenChange={(open) => !open && closeSettings()} label="Settings" zIndex={67} wrapStyle={{ paddingTop: '7vh' }} className="setm">
      <nav className="set-nav" aria-label="Settings sections">
        <div className="lbl hide-sm" style={{ padding: '4px 8px 8px' }}>
          Settings
        </div>
        {TABS.map((entry) => (
          <button key={entry.id} type="button" className="ni" aria-current={tab === entry.id ? 'page' : undefined} onClick={() => openSettings(entry.id)}>
            <Icon name={entry.icon} />
            <span>{entry.label}</span>
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <header style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 12px 0 22px', borderBottom: '1px solid var(--bd)', flex: 'none' }}>
          <DialogTitle className="grow" style={{ fontSize: 15, fontWeight: 600 }}>
            {current?.label ?? 'Settings'}
          </DialogTitle>
          <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close settings" onClick={closeSettings}>
            <Icon name="x" size="s" />
          </button>
        </header>
        <div className="scroll" style={{ padding: '8px 22px 22px', flex: 1, minHeight: 0 }}>
          {tab === 'profile' ? <ProfileTab /> : null}
          {tab === 'workstyle' ? <MyWorkstyle /> : null}
          {tab === 'appearance' ? <AppearanceTab /> : null}
          {tab === 'home' ? <HomePageTab /> : null}
          {tab === 'ai' ? <AiSettingsTab /> : null}
          {tab === 'notifications' ? <NotificationsTab /> : null}
          {tab === 'apps' ? <ConnectedAppsTab /> : null}
        </div>
      </div>
    </Modal>
  );
}
