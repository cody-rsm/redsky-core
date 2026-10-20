'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import type { IntelView, WidgetResponse } from '@/lib/api/contracts';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useWidget } from '@/lib/client/use-widget';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody, widgetSample } from '../widget-states';

type IntelCache = WidgetResponse<{ items: IntelView[] }>;

export function IntelWidget({ slot }: { slot: WidgetSlot }) {
  const router = useRouter();
  const client = useQueryClient();
  const query = useWidget('intel');
  const { toast, askAi } = useUiStore.getState();

  const setSaved = (id: string, saved: boolean) =>
    client.setQueryData<IntelCache>(queryKeys.widget('intel'), (current) =>
      current?.status === 'ok' ? { ...current, data: { items: current.data.items.map((item) => (item.id === id ? { ...item, saved } : item)) } } : current,
    );

  async function toggleSave(item: IntelView) {
    setSaved(item.id, !item.saved);
    try {
      await apiFetch(`/api/intel/${encodeURIComponent(item.id)}/save`, { method: 'POST', body: { saved: !item.saved } });
    } catch (error) {
      setSaved(item.id, item.saved);
      toast(errorMessage(error));
    }
  }

  async function share() {
    // Shares a link into RedSky itself, which only signed-in RSM staff can open.
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/home`);
      toast('Internal link copied — shareable with RSM staff only');
    } catch {
      toast('Couldn’t copy the link');
    }
  }

  return (
    <WidgetFrame slot={slot} sub="Tagged to your work" sample={widgetSample(query)} more={{ label: 'Intelligence', onClick: () => router.push('/m/intelligence') }}>
      <WidgetBody query={query} rows={4}>
        {(data) => (
          <div className="wb">
            {widgetSample(query) ? (
              <div className="note" style={{ margin: '0 6px 4px', fontSize: 11.5, padding: '7px 10px' }}>
                <Icon name="alert" size="xs" style={{ marginTop: 2 }} />
                <span>Illustrative sample content — not real news.</span>
              </div>
            ) : null}
            {data.items.length === 0 ? <div className="empty">Nothing new for your work today.</div> : null}
            {data.items.slice(0, slot.itemLimit).map((item) => (
              <article key={item.id} className="row" style={{ flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5 }} className="faint">
                  <span className="chip chip-o">{item.topic}</span>
                  <span>{item.source}</span>
                  <span aria-hidden="true">·</span>
                  <span className="num">{item.date}</span>
                </div>
                <div style={{ fontWeight: 500, fontSize: 13.5, lineHeight: 1.4 }}>{item.headline}</div>
                <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.5 }}>
                  <span className="ai-tag" style={{ marginRight: 6 }}>
                    <Icon name="ai" size="xs" />
                    Why it matters
                  </span>
                  {item.why}
                </div>
                <div style={{ display: 'flex', gap: 4, marginLeft: -6 }}>
                  <button type="button" className="btn btn-g btn-sm" aria-pressed={item.saved} onClick={() => void toggleSave(item)}>
                    <Icon name="bookmark" size="s" style={{ fill: item.saved ? 'currentColor' : 'none' }} />
                    {item.saved ? 'Saved' : 'Save'}
                  </button>
                  <button type="button" className="btn btn-g btn-sm" onClick={() => void share()}>
                    <Icon name="share" size="s" />
                    Share
                  </button>
                  <button type="button" className="btn btn-g btn-sm" style={{ color: 'var(--ai)' }} onClick={() => void askAi(`Why does “${item.headline}” matter to me?`, { key: 'intel', ref: item.id })}>
                    <Icon name="ai" size="s" />
                    Ask AI
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </WidgetBody>
    </WidgetFrame>
  );
}
