'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/icon';
import { Tile } from '@/components/ui/tile';
import type { NotificationsResponse, NotificationView } from '@/lib/api/contracts';
import { apiFetch } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';

export function NotificationsPanel() {
  const viewer = useViewer();
  const client = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: queryKeys.notifications, queryFn: () => apiFetch<NotificationsResponse>('/api/notifications') });
  const { setPopover, openSettings, openPrep } = useUiStore.getState();
  const { openRecord } = useWorkspaceActions();
  const batched = viewer.preferences.notifMode === 'batched';

  async function markRead() {
    client.setQueryData<NotificationsResponse>(queryKeys.notifications, (current) => (current?.status === 'ok' ? { ...current, items: current.items.map((item) => ({ ...item, unread: false })) } : current));
    await apiFetch('/api/notifications/read', { method: 'POST' });
  }

  function open(item: NotificationView) {
    setPopover(null);
    void markRead();
    if (item.target.kind === 'prep') openPrep(item.target.meetingId);
    else openRecord(item.target.kind, item.target.id);
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 8px' }}>
        <span style={{ fontWeight: 600 }}>Notifications</span>
        {batched ? (
          <span className="chip chip-ai" style={{ marginLeft: 8 }}>
            Batched · 9 AM &amp; 3 PM
          </span>
        ) : null}
        <div className="grow" />
        {data?.status === 'ok' ? (
          <button type="button" className="link" style={{ fontSize: 12 }} onClick={markRead}>
            Mark all as read
          </button>
        ) : null}
      </div>
      <div style={{ padding: '0 6px 6px' }}>
        {isLoading ? (
          <div className="wstate" aria-busy="true">
            <span className="sk-load" style={{ width: '70%', height: 10 }} />
            <span className="sk-load" style={{ width: '50%', height: 10 }} />
          </div>
        ) : data?.status === 'ok' ? (
          data.items.map((item) => (
            <button key={item.id} type="button" className="mi" style={{ alignItems: 'flex-start', padding: 10 }} onClick={() => open(item)}>
              <Tile icon={item.icon} small ai={item.ai} />
              <span className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>{item.text}</span>
                <span className="faint" style={{ fontSize: 11 }}>
                  {item.time}
                </span>
              </span>
              {item.unread ? <span className="dot" style={{ color: 'var(--ac)', marginTop: 6 }} /> : null}
            </button>
          ))
        ) : (
          <div className="wstate">
            <b>You’re all caught up</b>
            <span>Mentions, prep reminders and alerts will appear here once RedSky’s connectors are live.</span>
          </div>
        )}
      </div>
      <div className="wfoot">
        <Icon name="sliders" size="xs" />
        <button
          type="button"
          className="link"
          style={{ fontSize: 11.5 }}
          onClick={() => {
            setPopover(null);
            openSettings('notifications');
          }}
        >
          Notification settings
        </button>
      </div>
    </>
  );
}
