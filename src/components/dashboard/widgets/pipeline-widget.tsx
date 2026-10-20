'use client';

import { useRouter } from 'next/navigation';
import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody, widgetSample } from '../widget-states';

export function PipelineWidget({ slot }: { slot: WidgetSlot }) {
  const router = useRouter();
  const query = useWidget('pipeline');
  const { openRecord } = useWorkspaceActions();
  const sample = widgetSample(query);
  return (
    <WidgetFrame slot={slot} sub={sample ? 'Illustrative' : undefined} sample={sample} more={{ label: 'Open pipeline', onClick: () => router.push('/pipeline') }}>
      <WidgetBody query={query} rows={4}>
        {(data) => (
            <div className="wb" style={{ padding: '0 14px 12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(102px,1fr))', gap: 6 }}>
                {data.stages.map((stage) => (
                  <button key={stage.name} type="button" className="pst" onClick={() => router.push('/pipeline')} title={stage.name}>
                    <span className="faint ell" style={{ fontSize: 11.5 }}>
                      {stage.name}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <b className="serif num" style={{ fontSize: 22, fontWeight: 400, lineHeight: 1.1 }}>
                        {stage.count}
                      </b>
                      <span className={`dlt dlt-${stage.dir}`}>{stage.delta}</span>
                    </span>
                    <span className="faint num" style={{ fontSize: 11.5 }}>
                      {stage.value}
                    </span>
                    <span className={stage.neutral ? 'bar bar-n' : 'bar'} style={{ height: 4, marginTop: 2 }}>
                      <span style={{ width: `${stage.pct}%` }} />
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 6px' }}>
                <span className="lbl">Recent movement</span>
                <div className="grow" />
                <span className="faint num" style={{ fontSize: 11.5 }}>
                  {data.totalLabel}
                </span>
              </div>
              <div className="tlist" role="table" aria-label="Recent pipeline movement">
                <div className="trow th" role="row" data-cols="pl">
                  <span role="columnheader">Company</span>
                  <span role="columnheader">Stage</span>
                  <span role="columnheader" className="hide-sm">
                    Change
                  </span>
                  <span role="columnheader" className="hide-sm">
                    Lead
                  </span>
                  <span role="columnheader" style={{ textAlign: 'right' }}>
                    Size
                  </span>
                </div>
                {data.moves.slice(0, Math.max(3, slot.itemLimit - 1)).map((move) => (
                  <div key={move.id} className="trow" role="row" data-cols="pl">
                    <span role="cell" style={{ minWidth: 0 }}>
                      <button type="button" className="rel" onClick={() => openRecord('deal', move.id)}>
                        {move.name}
                      </button>
                      <span className="faint ell" style={{ display: 'block', fontSize: 11.5 }}>
                        {move.round}
                      </span>
                    </span>
                    <span role="cell">
                      <span className="chip">{move.stage}</span>
                    </span>
                    <span role="cell" className="muted hide-sm" style={{ fontSize: 12 }}>
                      {move.change}
                    </span>
                    <span role="cell" className="hide-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Avatar initials={move.lead.initials} tone={normalizeTone(move.lead.tone)} size="sm" />
                      <span className="ell">{move.lead.name}</span>
                    </span>
                    <span role="cell" className="num" style={{ textAlign: 'right' }}>
                      {move.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
        )}
      </WidgetBody>
    </WidgetFrame>
  );
}
