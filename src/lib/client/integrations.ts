'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CONNECTORS, type ConnectorId, type ConnectorState } from '@/features/integrations/catalog';
import type { ViewerPayload } from '@/lib/api/contracts';
import { apiFetch, errorMessage } from './api';
import { queryKeys } from './query-client';
import { useUiStore } from './ui-store';
import { useViewer } from './viewer';

// In this release every connector is "Coming soon"; the only per-employee state is the notify list.
export function connectorState(viewer: ViewerPayload, id: ConnectorId): ConnectorState {
  return viewer.integrations[id] === 'notify' ? 'notify' : viewer.integrations[id] === 'requested' ? 'requested' : 'soon';
}

export function useConnectorActions() {
  const viewer = useViewer();
  const client = useQueryClient();
  const toast = useUiStore((state) => state.toast);

  function markNotify(ids: ConnectorId[]) {
    client.setQueryData<ViewerPayload>(queryKeys.viewer, (current) => {
      if (!current) return current;
      const integrations = { ...current.integrations };
      for (const id of ids) integrations[id] = 'notify';
      return { ...current, integrations };
    });
  }

  async function notify(id: ConnectorId) {
    const connector = CONNECTORS.find((entry) => entry.id === id);
    markNotify([id]);
    try {
      await apiFetch('/api/integrations/notify', { method: 'POST', body: { connectorIds: [id] } });
      toast(`We'll let you know when ${connector?.name ?? 'it'} is available`);
    } catch (error) {
      toast(errorMessage(error));
      await client.invalidateQueries({ queryKey: queryKeys.viewer });
    }
  }

  async function notifyAll() {
    markNotify(CONNECTORS.map((connector) => connector.id));
    try {
      await apiFetch('/api/integrations/notify', { method: 'POST', body: { all: true } });
      toast("You'll be notified as each connector becomes available");
    } catch (error) {
      toast(errorMessage(error));
      await client.invalidateQueries({ queryKey: queryKeys.viewer });
    }
  }

  const counts = { soon: CONNECTORS.length, notify: CONNECTORS.filter((connector) => connectorState(viewer, connector.id) === 'notify').length };
  return { notify, notifyAll, counts, stateOf: (id: ConnectorId) => connectorState(viewer, id) };
}
