'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import type { GovView } from '@/lib/api/contracts';
import { useUiStore } from '@/lib/client/ui-store';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody, widgetSample } from '../widget-states';

const CHANGE_CHIP: Record<GovView['changeTone'], string> = { accent: 'chip chip-ac', warn: 'chip chip-wn', neutral: 'chip' };

export function GovAffairsWidget({ slot }: { slot: WidgetSlot }) {
  const router = useRouter();
  const query = useWidget('govaffairs');
  const toast = useUiStore((state) => state.toast);
  const { openRecord } = useWorkspaceActions();
  const sub = query.data?.status === 'ok' ? `${query.data.data.items.length} tracked` : undefined;
  return (
    <WidgetFrame slot={slot} sub={sub} sample={widgetSample(query)} more={{ label: 'Gov. Affairs', onClick: () => router.push('/m/gov') }}>
      <WidgetBody query={query} rows={3}>
        {(data) => (
          <>
            <div className="wb">
              {data.items.length === 0 ? <div className="empty">Nothing tracked yet.</div> : null}
              {data.items.slice(0, slot.itemLimit).map((item) => (
                <article key={item.id} className="row" style={{ flexDirection: 'column', gap: 9, alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div className="grow">
                      <button type="button" className="rel" style={{ fontSize: 13.5 }} onClick={() => (item.related ? openRecord(item.related.kind, item.related.id) : toast(`Tracking ${item.title}`))}>
                        {item.title}
                      </button>
                      <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>
                        {item.jurisdiction} · RSM position: {item.position}
                      </div>
                    </div>
                    <span className={CHANGE_CHIP[item.changeTone]}>{item.change}</span>
                  </div>
                  <div className="steps">
                    {item.steps.map((step) => (
                      <div key={step.label} className="stp" data-s={step.state}>
                        <span className="stp-d" />
                        <span className="stp-l">{step.label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} className="muted">
                    <Icon name="clock" size="xs" />
                    Next: <span style={{ fontWeight: 500, color: 'var(--tx)' }}>{item.next}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="wfoot">
              <Icon name="shield" size="xs" />
              Interactions with public officials are logged for disclosure review.
              <div className="grow" />
              {widgetSample(query) ? <span className="hide-sm">Illustrative items</span> : null}
            </div>
          </>
        )}
      </WidgetBody>
    </WidgetFrame>
  );
}
