'use client';

import { ConnectorLogo } from '@/components/common/connector-logo';
import { Icon } from '@/components/ui/icon';
import { CONNECTOR_GROUPS, CONNECTOR_STATE_VIEW, CONNECTORS } from '@/features/integrations/catalog';
import { useConnectorActions } from '@/lib/client/integrations';

const CHIP_CLASS = { ok: 'chip chip-ok', outline: 'chip chip-o', warn: 'chip chip-wn', neutral: 'chip' } as const;
const BUTTON_CLASS = { ghost: 'btn btn-sm btn-g', primary: 'btn btn-sm btn-p', default: 'btn btn-sm' } as const;

export function ConnectStep() {
  const { notify, notifyAll, counts, stateOf } = useConnectorActions();
  return (
    <div className="ob-inner a-in" style={{ maxWidth: 1080 }}>
      <span className="lbl">Step 5 · Connect</span>
      <h1 className="ob-h serif">Connect your workspace</h1>
      <p className="ob-sub">
        RedSky will work alongside the systems RSM already uses — they stay authoritative, and RedSky connects them. These connectors are coming soon: choose Notify me on the ones you use, and we’ll let you know when each is ready.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
        <span className="chip">
          <span className="dot" />
          {counts.soon} connectors coming soon
        </span>
        <span className="chip chip-ok">{counts.notify} you’ll be notified about</span>
        <div className="grow" />
        <button type="button" className="btn btn-sm" onClick={() => void notifyAll()} disabled={counts.notify === counts.soon}>
          <Icon name="bell" size="s" />
          Notify me about all
        </button>
      </div>
      <div className="note" style={{ marginTop: 14 }}>
        <Icon name="alert" size="s" style={{ marginTop: 1 }} />
        <span>No connectors are live yet. Providers without a logo here are shown as monograms until official brand assets are added.</span>
      </div>
      {CONNECTOR_GROUPS.map((group) => (
        <div key={group.id} style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>{group.name}</h2>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {group.desc}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(290px,100%),1fr))', gap: 12 }}>
            {CONNECTORS.filter((connector) => connector.group === group.id).map((connector) => {
              const view = CONNECTOR_STATE_VIEW[stateOf(connector.id)];
              return (
                <div key={connector.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <ConnectorLogo connector={connector} />
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{connector.name}</div>
                      <div className="faint" style={{ fontSize: 11.5 }}>
                        {connector.kind}
                      </div>
                    </div>
                    <span className={CHIP_CLASS[view.chip]}>
                      <span className="dot" />
                      {view.label}
                    </span>
                  </div>
                  <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                    {connector.enables}
                  </p>
                  <div className="faint" style={{ fontSize: 11.5, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                    <Icon name="lock" size="xs" style={{ marginTop: 2 }} />
                    <span>{connector.access}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                    <div className="grow" />
                    <button type="button" className={BUTTON_CLASS[view.actionVariant]} disabled={view.disabled} onClick={() => void notify(connector.id)}>
                      {view.busy ? <Icon name="refresh" size="xs" className="spin" /> : null}
                      {view.action}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
