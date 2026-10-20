'use client';

import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ToastViewport } from '@/components/common/toast-viewport';
import { WidgetLibraryDrawer } from '@/components/dashboard/widget-library-drawer';
import { AiPanel } from '@/components/overlays/ai-panel';
import { CommandPalette } from '@/components/overlays/command-palette';
import { MeetingPrepDrawer } from '@/components/overlays/meeting-prep-drawer';
import { QuickCreateModal } from '@/components/overlays/quick-create-modal';
import { RecordPreviewDrawer } from '@/components/overlays/record-preview-drawer';
import { SettingsModal } from '@/components/settings/settings-modal';
import { useUiStore } from '@/lib/client/ui-store';
import { useThemeSync, useViewer } from '@/lib/client/viewer';
import { DemoSwitcher } from './demo-switcher';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const pathname = usePathname();
  useGlobalShortcuts();
  useThemeSync(viewer.preferences.theme);
  // Customizing is a mode of the home page; navigating elsewhere ends it (prototype go()).
  useEffect(() => {
    if (pathname !== '/home') useUiStore.getState().setCustomizing(false);
  }, [pathname]);

  return (
    <div className="app a-fade" data-nav={viewer.preferences.sidebar} data-mobile={mobileNavOpen}>
      {mobileNavOpen ? <button type="button" className="backdrop" style={{ zIndex: 57 }} aria-label="Close navigation" onClick={() => useUiStore.getState().setPopover(null)} /> : null}
      <Sidebar />
      <div className="main">
        <TopBar />
        <div className="content scroll" id="content">
          {children}
        </div>
      </div>
      <AiPanel />
      <WidgetLibraryDrawer />
      <MeetingPrepDrawer />
      <RecordPreviewDrawer />
      <CommandPalette />
      <SettingsModal />
      <QuickCreateModal />
      <ConfirmDialog />
      <ToastViewport />
      {viewer.config.dataMode === 'demo' ? <DemoSwitcher /> : null}
    </div>
  );
}

// ⌘K / ⌘J and the layered Escape of the prototype. Modal layers (Radix) handle their own Escape and mark the
// event handled, so one press only ever closes the top-most layer.
function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const store = useUiStore.getState();
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        store.togglePalette();
        return;
      }
      if (command && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        store.setAiOpen(!store.aiOpen);
        return;
      }
      if (event.key === 'Escape' && !event.defaultPrevented && !store.hasModalOpen()) {
        if (store.escapeNonModalLayer()) event.preventDefault();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
