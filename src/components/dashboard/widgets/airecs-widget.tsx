'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { AiRecommendationView, WidgetResponse } from '@/lib/api/contracts';
import { Icon } from '@/components/ui/icon';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody } from '../widget-states';

type RecsCache = WidgetResponse<{ items: AiRecommendationView[] }>;

export function AiRecsWidget({ slot }: { slot: WidgetSlot }) {
  const viewer = useViewer();
  const client = useQueryClient();
  const query = useWidget('airecs');
  const { askAi, setAiOpen, requestConfirm, toast } = useUiStore.getState();
  const { confirmed } = useWorkspaceActions();
  const items = query.data?.status === 'ok' ? query.data.data.items : [];
  const shown = items.slice(0, slot.itemLimit);

  const hide = (id: string) =>
    client.setQueryData<RecsCache>(queryKeys.widget('airecs'), (current) => (current?.status === 'ok' ? { ...current, data: { items: current.data.items.filter((item) => item.id !== id) } } : current));

  async function dismiss(item: AiRecommendationView) {
    hide(item.id);
    try {
      await apiFetch(`/api/recommendations/${encodeURIComponent(item.id)}/dismiss`, { method: 'POST' });
    } catch (error) {
      toast(errorMessage(error));
      await client.invalidateQueries({ queryKey: queryKeys.widget('airecs') });
    }
  }

  function act(item: AiRecommendationView) {
    if (item.ask) return void askAi(item.ask.question, { key: item.ask.key, ref: item.ask.ref });
    if (!item.confirm) return;
    requestConfirm({
      ...item.confirm,
      run: async () => {
        const result = await confirmed({ type: 'recommendation', id: item.id });
        hide(item.id);
        toast(result.message);
      },
    });
  }

  return (
    <WidgetFrame slot={slot} sub={query.data?.status === 'ok' ? `${shown.length} new` : undefined} more={{ label: 'Ask RedSky', onClick: () => setAiOpen(true) }}>
      <WidgetBody query={query} rows={3}>
        {() => (
          <div className="wb" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(240px,100%),1fr))', gap: 8, padding: '0 14px 14px' }}>
            {shown.map((item) => (
              <div key={item.id} className="ai-box" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="ai" size="s" style={{ color: 'var(--ai)', marginTop: 2 }} />
                  <span style={{ fontSize: 13, lineHeight: 1.45, fontWeight: 500 }}>{item.text}</span>
                </div>
                <div className="faint" style={{ fontSize: 11.5, paddingLeft: 22 }}>
                  Based on: {item.basis}
                </div>
                <div style={{ display: 'flex', gap: 6, paddingLeft: 22, marginTop: 'auto' }}>
                  <button type="button" className="btn btn-sm btn-ai" style={{ background: 'var(--sf)' }} onClick={() => act(item)}>
                    {item.actionLabel}
                  </button>
                  <button type="button" className="btn btn-g btn-sm" onClick={() => void dismiss(item)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
            {shown.length === 0 ? (
              <div className="empty" style={{ gridColumn: '1/-1' }}>
                {viewer.config.dataMode === 'demo' ? 'No new recommendations right now.' : 'Recommendations appear here as RedSky learns from your connected sources — none are connected yet.'}
              </div>
            ) : null}
          </div>
        )}
      </WidgetBody>
    </WidgetFrame>
  );
}
