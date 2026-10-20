'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ConnectorLogo } from '@/components/common/connector-logo';
import { Icon } from '@/components/ui/icon';
import { CONNECTOR_IDS, type ConnectorId } from '@/features/integrations/catalog';
import type { NotConnectedSource, WidgetResponse } from '@/lib/api/contracts';
import { useConnectorActions } from '@/lib/client/integrations';

export function WidgetLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="wb" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 14px 16px' }}>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="sk-load" style={{ height: 14, width: `${88 - index * 14}%` }} />
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function WidgetError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="wb">
      <div className="wstate" role="alert">
        <b>Couldn’t load this widget</b>
        <span>{message}</span>
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          <Icon name="refresh" size="s" />
          Try again
        </button>
      </div>
    </div>
  );
}

const isConnectorId = (value: string): value is ConnectorId => (CONNECTOR_IDS as ReadonlyArray<string>).includes(value);

// The designed "not connected" state (SPEC §8): what the source would enable, and how to hear when it's ready.
export function WidgetNotConnected({ source }: { source: NotConnectedSource }) {
  const { notify, stateOf } = useConnectorActions();
  const connectorId = isConnectorId(source.connectorId) ? source.connectorId : null;
  const notified = connectorId ? stateOf(connectorId) === 'notify' : false;
  return (
    <div className="wb">
      <div className="empty">
        <ConnectorLogo connector={source} />
        <div style={{ fontWeight: 600, color: 'var(--tx)' }}>{source.title}</div>
        <div style={{ fontSize: 12.5, maxWidth: 320 }}>{source.body}</div>
        {connectorId ? (
          <button type="button" className="btn btn-sm" disabled={notified} onClick={() => void notify(connectorId)}>
            <Icon name="bell" size="s" />
            {notified ? 'You’ll be notified' : 'Notify me when available'}
          </button>
        ) : (
          <span className="chip chip-o">Planned</span>
        )}
      </div>
    </div>
  );
}

type WidgetQuery<TData> = UseQueryResult<WidgetResponse<TData>>;

// Renders loading / error / not-connected, or hands the loaded data to `children`.
export function WidgetBody<TData>({ query, rows, children }: { query: WidgetQuery<TData>; rows?: number; children: (data: TData) => ReactNode }) {
  if (query.isPending) return <WidgetLoading rows={rows} />;
  if (query.isError) return <WidgetError message={query.error.message} onRetry={() => void query.refetch()} />;
  if (query.data.status === 'not_connected') return <WidgetNotConnected source={query.data.source} />;
  return <>{children(query.data.data)}</>;
}

export function widgetSample<TData>(query: WidgetQuery<TData>): boolean {
  return query.data?.status === 'ok' && query.data.sample;
}
