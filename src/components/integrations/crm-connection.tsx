'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import type { CrmConnectionView } from '@/lib/api/contracts';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';

// RedSky reads the CRM as each person, with access they grant once in Twenty (docs/DECISIONS.md 7).

export function crmConnectHref(returnTo: string): string {
  return `/api/integrations/twenty/connect?returnTo=${encodeURIComponent(returnTo)}`;
}

const OUTCOME_MESSAGES: Record<string, string> = {
  connected: 'Twenty connected. RedSky now shows the CRM as you see it there.',
  mismatch: 'That Twenty account belongs to someone else. Sign in to Twenty as yourself, then connect again.',
  denied: 'Access to Twenty wasn’t granted.',
  unreachable: 'Twenty couldn’t be reached. Please try again later.',
  not_configured: 'The CRM connection isn’t set up yet.',
};

// Twenty's consent page sends people back with ?crm=<outcome>; say what happened, then tidy the address bar.
export function CrmConnectionNotice() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const outcome = searchParams.get('crm');
  useEffect(() => {
    if (!outcome) return;
    useUiStore.getState().toast(OUTCOME_MESSAGES[outcome] ?? 'Connecting Twenty didn’t work. Please try again.');
    void client.invalidateQueries({ queryKey: queryKeys.viewer });
    if (outcome === 'connected') void client.invalidateQueries({ queryKey: queryKeys.people });
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete('crm');
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [outcome, searchParams, pathname, router, client]);
  return null;
}

const STATUS_VIEW: Record<CrmConnectionView['status'], { chip: string; tone: 'ok' | 'warn' | 'outline' | 'neutral' }> = {
  connected: { chip: 'Connected', tone: 'ok' },
  reconnect: { chip: 'Reconnect needed', tone: 'warn' },
  not_connected: { chip: 'Not connected', tone: 'outline' },
  not_configured: { chip: 'Not set up', tone: 'neutral' },
};

// The person's own Twenty connection, at the top of Settings › Connected apps.
export function CrmConnectionRow() {
  const viewer = useViewer();
  const pathname = usePathname();
  const client = useQueryClient();
  const { toast, requestConfirm } = useUiStore.getState();
  const [busy, setBusy] = useState(false);
  const { status, account } = viewer.crm;
  const view = STATUS_VIEW[status];

  function confirmDisconnect() {
    requestConfirm({
      title: 'Disconnect Twenty?',
      body: 'RedSky stops reading the CRM for you, and Twenty revokes the access you granted. You can connect again at any time.',
      items: account ? [account] : [],
      ok: 'Disconnect',
      run: async () => {
        setBusy(true);
        try {
          await apiFetch<CrmConnectionView>('/api/integrations/twenty', { method: 'DELETE' });
          await Promise.all([client.invalidateQueries({ queryKey: queryKeys.viewer }), client.invalidateQueries({ queryKey: queryKeys.people })]);
          toast('Twenty disconnected');
        } catch (error) {
          toast(errorMessage(error));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <div className="setrow" style={{ gap: 12 }}>
      <span className="lt lt-0" aria-hidden="true" style={{ width: 32, height: 32 }}>
        CR
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500 }}>RSM CRM (Twenty)</div>
        <div className="faint ell" style={{ fontSize: 12 }}>
          {status === 'connected' && account ? `Connected as ${account}. RedSky sees exactly what your Twenty role allows.` : null}
          {status === 'reconnect' ? 'Twenty no longer accepts this connection. Reconnect to see CRM records again.' : null}
          {status === 'not_connected' ? 'People, companies and deals, read with your own Twenty access.' : null}
          {status === 'not_configured' ? 'Your administrator hasn’t connected RedSky to the CRM yet.' : null}
        </div>
      </div>
      <Chip tone={view.tone} dot className="hide-sm">
        {view.chip}
      </Chip>
      {status === 'connected' ? (
        <button type="button" className="btn btn-sm" disabled={busy} onClick={confirmDisconnect}>
          Disconnect
        </button>
      ) : null}
      {status === 'not_connected' || status === 'reconnect' ? (
        <a className="btn btn-sm btn-p" href={crmConnectHref(pathname)}>
          <Icon name="link" size="s" />
          {status === 'reconnect' ? 'Reconnect' : 'Connect'}
        </a>
      ) : null}
    </div>
  );
}
