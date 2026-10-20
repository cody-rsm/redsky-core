'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { QUICK_ACTIONS } from '@/features/quick-create/catalog';
import type { BriefData } from '@/lib/api/contracts';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { dayContext, viewerDisplay } from '@/lib/client/viewer-display';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody } from '../widget-states';

export function BriefWidget({ slot }: { slot: WidgetSlot }) {
  const query = useWidget('brief');
  return (
    <WidgetFrame slot={slot} headless>
      <WidgetBody query={query} rows={4}>
        {(data) => <BriefHero data={data} />}
      </WidgetBody>
    </WidgetFrame>
  );
}

function BriefHero({ data }: { data: BriefData }) {
  const viewer = useViewer();
  const router = useRouter();
  const { askAi, setAiOpen, openSettings, openPrep, openCreate } = useUiStore.getState();
  const { openRecord } = useWorkspaceActions();
  const { todayLabel, greeting } = dayContext(viewer);
  const name = viewerDisplay(viewer).greetingName;
  const includes = viewer.preferences.briefIncludes;
  const stats = data.stats.filter((stat) => includes[stat.key]);

  const goStat = (target: BriefData['stats'][number]['target']) => {
    if (target.kind === 'prep') openPrep(target.meetingId);
    else if (target.kind === 'tab') router.push(`/home?tab=${target.tab}`);
    else if (target.kind === 'nav') router.push(target.href);
    else if (target.kind === 'ask') void askAi(target.question, { key: target.key });
    else openSettings(target.tab);
  };

  return (
    <div className="brief">
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="rule" />
          <span className="lbl">Daily Brief · {todayLabel}</span>
        </div>
        <h1 className="serif">
          {greeting}, {name}.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.62, color: 'var(--tx2)', maxWidth: 660, textWrap: 'pretty' }}>{data.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {data.synthesized ? (
            <span className="chip chip-ai">
              <Icon name="ai" size="xs" />
              Synthesized by RedSky AI
            </span>
          ) : (
            <span className="chip chip-o">Summary</span>
          )}
          <span className="faint" style={{ fontSize: 11.5 }}>
            {data.provenance}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-p" onClick={() => void askAi('Give me my full daily brief.', { key: 'brief' })} disabled={!viewer.config.aiAvailable}>
            View full brief
          </button>
          <button type="button" className="btn btn-ai" onClick={() => setAiOpen(true)}>
            <Icon name="ai" size="s" />
            Ask RedSky
          </button>
          <button type="button" className="btn btn-g" onClick={() => openSettings('home')}>
            <Icon name="sliders" size="s" />
            Customize brief
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, alignContent: 'start' }}>
        {stats.map((stat) => (
          <button key={stat.key} type="button" className="stat" onClick={() => goStat(stat.target)}>
            <b>{stat.value}</b>
            <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{stat.label}</span>
          </button>
        ))}
      </div>
      {data.highlights.length > 0 ? (
        <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(250px,100%),1fr))', gap: 10, position: 'relative' }}>
          {data.highlights.map((highlight) => (
            <button
              key={highlight.title}
              type="button"
              className="hl"
              onClick={() => (highlight.target.kind === 'prep' ? openPrep(highlight.target.meetingId) : openRecord(highlight.target.kind, highlight.target.id))}
            >
              <span className="lbl" style={{ color: highlight.accent ? 'var(--act)' : 'var(--tx3)' }}>
                {highlight.kicker}
              </span>
              <span className="ell" style={{ fontWeight: 500, fontSize: 13.5 }}>
                {highlight.title}
              </span>
              <span className="faint ell" style={{ fontSize: 12 }}>
                {highlight.meta}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--bd)', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
        <span className="lbl" style={{ marginRight: 4 }}>
          Quick actions
        </span>
        {QUICK_ACTIONS.map((action) => (
          <button key={action.type} type="button" className="btn btn-sm" onClick={() => openCreate(action.type)}>
            <Icon name={action.icon} size="s" />
            {action.label}
          </button>
        ))}
        <button type="button" className="btn btn-sm btn-ai" onClick={() => setAiOpen(true)}>
          <Icon name="ai" size="s" />
          Ask RedSky AI
        </button>
      </div>
    </div>
  );
}
