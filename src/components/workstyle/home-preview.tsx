'use client';

import { useState } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { AI_STYLES, DENSITIES, WIDGETS, type LayoutItem } from '@/features/personalization/catalog';
import { DRAFT_TONE_LABELS, NOTIF_MODE_LABELS, PREP_FORMAT_LABELS, TASK_GROUP_LABELS, type DraftTone, type NotifMode, type PrepFormat, type TaskGroup } from '@/features/preferences/schema';
import type { WorkstyleDetail } from '@/lib/api/contracts';
import { useViewer } from '@/lib/client/viewer';
import { dayContext, viewerDisplay } from '@/lib/client/viewer-display';

type Snapshot = { density: string; aiStyle: string; prepFormat: string; taskGroup: string; notifMode: string; draftTone: string; layout: LayoutItem[] };

const ROWS: ReadonlyArray<{ key: keyof Omit<Snapshot, 'layout'>; label: string; icon: IconName; text: (value: string) => string }> = [
  { key: 'aiStyle', label: 'AI responses', icon: 'ai', text: (value) => AI_STYLES.find((style) => style.id === value)?.label ?? value },
  { key: 'density', label: 'Detail level', icon: 'grid', text: (value) => DENSITIES.find((density) => density.id === value)?.label ?? value },
  { key: 'prepFormat', label: 'Meeting prep', icon: 'calendar', text: (value) => PREP_FORMAT_LABELS[value as PrepFormat] ?? value },
  { key: 'taskGroup', label: 'Tasks', icon: 'tasks', text: (value) => TASK_GROUP_LABELS[value as TaskGroup] ?? value },
  { key: 'notifMode', label: 'Notifications', icon: 'bell', text: (value) => NOTIF_MODE_LABELS[value as NotifMode] ?? value },
  { key: 'draftTone', label: 'AI drafts', icon: 'edit', text: (value) => DRAFT_TONE_LABELS[value as DraftTone] ?? value },
];

// Before = the settings snapshot taken when the assessment was first processed; after = the live settings,
// which the server has already recomputed from the employee's decisions.
export function WorkstyleHomePreview({ detail }: { detail: WorkstyleDetail }) {
  const viewer = useViewer();
  const [mode, setMode] = useState<'before' | 'after'>('after');
  const baseline = detail.baseline;
  const current: Snapshot = { ...viewer.preferences, layout: viewer.layout.layout };
  const shown: Snapshot = mode === 'before' && baseline ? baseline : current;
  const after = mode === 'after';
  const baseIds = baseline ? baseline.layout.filter((item) => item.id !== 'brief').map((item) => `${item.id}:${item.size}`) : [];
  const layout = shown.layout.filter((item) => item.id !== 'brief');
  const greeting = `${dayContext(viewer).greeting}, ${viewerDisplay(viewer).greetingName}`;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>Your home page</span>
        <div className="grow" />
        <Segmented
          small
          label="Compare before and after"
          options={[
            { value: 'before', label: 'Before' },
            { value: 'after', label: 'After' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      <p className="faint" style={{ fontSize: 12, marginBottom: 12 }}>
        Updates as you accept, customize or dismiss. Highlighted items changed.
      </p>
      <div style={{ border: '1px solid var(--bd)', borderRadius: 10, background: 'var(--bg)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }} aria-hidden="true">
        <div className="mb mb-brief" style={{ cursor: 'default', minHeight: 50 }}>
          <span className="serif" style={{ fontSize: 14 }}>
            {greeting}
          </span>
          <span className="sk" style={{ width: '70%', height: 4 }} />
        </div>
        <div className="mg">
          {layout.map((item, index) => (
            <div key={item.id} className={`mb mg-${item.size}`} data-chg={Boolean(baseline) && after && baseIds[index] !== `${item.id}:${item.size}`} style={{ cursor: 'default' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name={WIDGETS[item.id].icon} size="xs" style={{ flex: 'none' }} />
                <span className="ell">{WIDGETS[item.id].name}</span>
              </span>
              <span className="sk" style={{ width: '70%', height: 4 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
        {ROWS.map((row) => (
          <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--bd)', fontSize: 12.5 }}>
            <Icon name={row.icon} size="s" className="faint" />
            <span className="faint" style={{ width: 96, flex: 'none' }}>
              {row.label}
            </span>
            <span className="grow ell" style={{ fontWeight: 500 }}>
              {row.text(shown[row.key])}
            </span>
            {baseline && after && baseline[row.key] !== current[row.key] ? (
              <span className="chip chip-ai" style={{ height: 18, fontSize: 10.5 }}>
                Changed
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
