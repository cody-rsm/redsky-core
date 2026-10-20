'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { RecordKind } from '@/features/ai/types';
import type { AttentionItemView, ConfirmOrigin, ConfirmResult } from '@/lib/api/contracts';
import { apiFetch } from './api';
import { queryKeys } from './query-client';
import { useUiStore } from './ui-store';

// Behaviors shared by widgets, drawers, the palette and the AI panel, so every surface acts the same way.
export function useWorkspaceActions() {
  const client = useQueryClient();
  const router = useRouter();
  const store = useUiStore.getState;

  const refreshWidgets = () => client.invalidateQueries({ queryKey: queryKeys.widgets });

  function openRecord(kind: RecordKind | 'company', id: string) {
    if (kind === 'meeting') store().openPrep(id);
    else if (kind === 'task') router.push('/home?tab=tasks');
    else store().openPreview({ kind, id });
  }

  async function confirmed(origin: ConfirmOrigin): Promise<ConfirmResult> {
    const result = await apiFetch<ConfirmResult>('/api/actions/confirm', { method: 'POST', body: origin });
    await refreshWidgets();
    return result;
  }

  async function setAttention(item: AttentionItemView, patch: { done?: boolean; dismissed?: boolean }) {
    await apiFetch(`/api/attention/${encodeURIComponent(item.key)}`, { method: 'PATCH', body: patch });
    await refreshWidgets();
  }

  function toggleDone(item: AttentionItemView) {
    const nextDone = !item.done;
    patchAttentionCache(client, item.key, { done: nextDone });
    void setAttention(item, { done: nextDone }).catch(() => store().toast('Couldn’t update that item.'));
    if (nextDone) {
      store().toast(`Completed: ${item.title}`, () => {
        patchAttentionCache(client, item.key, { done: false });
        void setAttention(item, { done: false });
      });
    }
  }

  function dismiss(item: AttentionItemView) {
    removeFromAttentionCache(client, item.key);
    void setAttention(item, { dismissed: true }).catch(() => store().toast('Couldn’t dismiss that item.'));
    store().toast('Dismissed from your list', () => void setAttention(item, { dismissed: false }));
  }

  function approve(approval: { id: string; title: string; requestedBy: string }) {
    store().requestConfirm({
      title: `Approve ${approval.title.split(' — ')[0]}?`,
      body: `Your approval is recorded and ${approval.requestedBy} is notified.`,
      items: [approval.title],
      ok: 'Approve',
      run: async () => {
        const result = await confirmed({ type: 'approval', id: approval.id });
        store().closePreview();
        store().toast(result.message);
      },
    });
  }

  function proposeTasks(origin: ConfirmOrigin, items: string[], after?: () => void) {
    const count = items.length;
    store().requestConfirm({
      title: `Create ${count} ${count === 1 ? 'task' : 'tasks'}?`,
      body: 'RedSky AI proposed the following. They will be added to My Tasks and assigned to you.',
      items,
      ok: 'Create tasks',
      run: async () => {
        const result = await confirmed(origin);
        after?.();
        store().toast(result.message);
      },
    });
  }

  return { openRecord, confirmed, toggleDone, dismiss, approve, proposeTasks, refreshWidgets };
}

type AttentionCache = { status: 'ok'; sample: boolean; data: { items: AttentionItemView[] } };

function patchAttentionCache(client: ReturnType<typeof useQueryClient>, key: string, patch: Partial<AttentionItemView>) {
  client.setQueryData<AttentionCache>(queryKeys.widget('attention'), (current) =>
    current && current.status === 'ok' ? { ...current, data: { items: current.data.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) } } : current,
  );
}

function removeFromAttentionCache(client: ReturnType<typeof useQueryClient>, key: string) {
  client.setQueryData<AttentionCache>(queryKeys.widget('attention'), (current) =>
    current && current.status === 'ok' ? { ...current, data: { items: current.data.items.filter((item) => item.key !== key) } } : current,
  );
}
