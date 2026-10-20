'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { Tile } from '@/components/ui/tile';
import { WS_RECOMMENDATIONS, type WsRecommendationDefinition } from '@/features/workstyle/catalog';
import type { WorkstyleRecommendationView } from '@/lib/api/contracts';
import { useWorkstyleActions } from '@/lib/client/workstyle';

const STATUS_VIEW = {
  accepted: { label: 'Accepted', chip: 'chip-ok' },
  dismissed: { label: 'Dismissed', chip: '' },
  pending: { label: 'Suggested', chip: 'chip-ai' },
} as const;

export function recommendationPairs(recommendations: ReadonlyArray<WorkstyleRecommendationView>) {
  return WS_RECOMMENDATIONS.flatMap((definition) => {
    const state = recommendations.find((entry) => entry.id === definition.id);
    if (!state) return [];
    const option = definition.options.find((entry) => entry.value === state.choice) ?? definition.options[0];
    return option ? [{ definition, state, option }] : [];
  });
}

type CardProps = { definition: WsRecommendationDefinition; state: WorkstyleRecommendationView };

// Onboarding: accept / customize / dismiss card (prototype .wsr article).
export function RecommendationCard({ definition, state }: CardProps) {
  const { change } = useWorkstyleActions();
  const [customizing, setCustomizing] = useState(false);
  const option = definition.options.find((entry) => entry.value === state.choice) ?? definition.options[0];
  const accepted = state.status === 'accepted';
  const dismissed = state.status === 'dismissed';
  const view = STATUS_VIEW[state.status];
  return (
    <article className="wsr" data-st={state.status}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Tile icon={definition.icon} small />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{definition.area}</span>
        <div className="grow" />
        <span className={`chip ${view.chip}`}>{view.label}</span>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        <span className="rec-tag" style={{ marginRight: 6 }}>
          <Icon name="doc" size="xs" />
          From your assessment
        </span>
        <span className="muted">{state.insight}</span>
      </div>
      <div className="ai-box" style={{ fontSize: 13, padding: '10px 12px' }}>
        <span className="ai-tag" style={{ display: 'flex', marginBottom: 3 }}>
          <Icon name="ai" size="xs" />
          Proposed adjustment
        </span>
        <span style={{ fontWeight: 500 }}>{option?.desc}</span>
      </div>
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Why it might help · </span>
        {option?.why}
      </div>
      {customizing ? (
        <div className="a-pop" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="flabel">Choose what works for you</span>
          <Segmented
            label={`Options for ${definition.area}`}
            options={definition.options.map((entry) => ({ value: entry.value, label: entry.label }))}
            value={state.choice}
            onChange={(choice) => change.mutate({ id: definition.id, choice, status: 'accepted' })}
            style={{ alignSelf: 'flex-start' }}
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className={accepted ? 'btn btn-sm' : 'btn btn-sm btn-p'} aria-pressed={accepted} onClick={() => change.mutate({ id: definition.id, status: accepted ? 'pending' : 'accepted' })}>
          <Icon name="check" size="s" />
          {accepted ? 'Accepted' : 'Accept'}
        </button>
        <button type="button" className="btn btn-sm" aria-pressed={customizing} aria-expanded={customizing} onClick={() => setCustomizing((open) => !open)}>
          <Icon name="sliders" size="s" />
          Customize
        </button>
        <button type="button" className="btn btn-sm btn-g" onClick={() => change.mutate({ id: definition.id, status: dismissed ? 'pending' : 'dismissed' })}>
          {dismissed ? 'Restore' : 'Dismiss'}
        </button>
      </div>
    </article>
  );
}

// Settings › My Workstyle: one row per recommendation with a switch and option picker.
export function RecommendationRow({ definition, state }: CardProps) {
  const { change } = useWorkstyleActions();
  const option = definition.options.find((entry) => entry.value === state.choice) ?? definition.options[0];
  const accepted = state.status === 'accepted';
  const view = STATUS_VIEW[state.status];
  return (
    <div className="setrow" style={{ alignItems: 'flex-start', gap: 12 }}>
      <Tile icon={definition.icon} small style={{ marginTop: 2 }} />
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 500 }}>{definition.area}</span>
          <span className={`chip ${view.chip}`} style={{ height: 18, fontSize: 10.5 }}>
            {view.label}
          </span>
        </div>
        <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
          {option?.desc}
        </span>
        <Segmented
          small
          label={`Options for ${definition.area}`}
          options={definition.options.map((entry) => ({ value: entry.value, label: entry.label }))}
          value={state.choice}
          onChange={(choice) => change.mutate({ id: definition.id, choice, status: 'accepted' })}
          style={{ alignSelf: 'flex-start' }}
        />
      </div>
      <Switch checked={accepted} label={`Apply ${definition.area} recommendation`} onCheckedChange={(on) => change.mutate({ id: definition.id, status: on ? 'accepted' : 'dismissed' })} style={{ marginTop: 2 }} />
    </div>
  );
}
