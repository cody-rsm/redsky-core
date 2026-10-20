'use client';

import { useRouter } from 'next/navigation';
import { ConnectorLogo } from '@/components/common/connector-logo';
import { CrmConnectionRow } from '@/components/integrations/crm-connection';
import { Chip, type ChipTone } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { CONNECTOR_STATE_VIEW, CONNECTORS } from '@/features/integrations/catalog';
import { AI_STYLES, DENSITIES, LANDINGS, type Density, type LandingId } from '@/features/personalization/catalog';
import { DIGEST_TIMES, type NotifMode, type SidebarMode, type Theme } from '@/features/preferences/schema';
import { useConnectorActions } from '@/lib/client/integrations';
import { useLayoutActions } from '@/lib/client/layout-actions';
import { useUiStore } from '@/lib/client/ui-store';
import { useUpdatePreferences, useViewer } from '@/lib/client/viewer';

const THEME_OPTIONS: ReadonlyArray<{ id: Theme; label: string; bg: string; side: string; line: string; bd: string }> = [
  { id: 'light', label: 'Light', bg: '#F7F5EF', side: '#F1EEE6', line: '#E6E1D6', bd: '#E6E1D6' },
  { id: 'dark', label: 'Dark', bg: '#161210', side: '#120F0D', line: '#45392F', bd: '#322A25' },
];

export function AppearanceTab() {
  const viewer = useViewer();
  const update = useUpdatePreferences();
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, paddingTop: 14 }}>
        {THEME_OPTIONS.map((option) => (
          <button key={option.id} type="button" className="sel" style={{ padding: 10 }} aria-pressed={viewer.preferences.theme === option.id} onClick={() => update.mutate({ theme: option.id })}>
            <span aria-hidden="true" style={{ height: 86, borderRadius: 8, display: 'flex', overflow: 'hidden', border: `1px solid ${option.bd}`, width: '100%' }}>
              <span style={{ width: '28%', background: option.side }} />
              <span style={{ flex: 1, background: option.bg, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ height: 7, width: '50%', borderRadius: 3, background: '#941B1E', opacity: 0.8 }} />
                <span style={{ height: 5, width: '80%', borderRadius: 3, background: option.line }} />
                <span style={{ height: 5, width: '64%', borderRadius: 3, background: option.line }} />
              </span>
            </span>
            <span style={{ fontWeight: 600 }}>{option.label}</span>
          </button>
        ))}
      </div>
      <div className="setrow" style={{ marginTop: 12 }}>
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Sidebar</div>
          <div className="faint" style={{ fontSize: 12 }}>
            Collapse to icons for more room
          </div>
        </div>
        <Segmented<SidebarMode>
          small
          label="Sidebar"
          options={[
            { value: 'full', label: 'Expanded' },
            { value: 'collapsed', label: 'Collapsed' },
          ]}
          value={viewer.preferences.sidebar}
          onChange={(sidebar) => update.mutate({ sidebar })}
        />
      </div>
    </>
  );
}

const BRIEF_INCLUDES = [
  { key: 'meetings', label: 'Meetings today' },
  { key: 'tasks', label: 'Items that need attention' },
  { key: 'opps', label: 'Opportunities with recent activity' },
  { key: 'followups', label: 'Follow-ups from last week' },
] as const;

export function LandingSelect({ compact }: { compact?: boolean }) {
  const viewer = useViewer();
  const update = useUpdatePreferences();
  return (
    <select
      className="input"
      aria-label="Default view"
      id={compact ? 'def-view' : undefined}
      style={compact ? { height: 28, width: 'auto', fontSize: 12, padding: '0 8px' } : { width: 'auto', height: 30, fontSize: 12.5 }}
      value={viewer.preferences.landing}
      onChange={(event) => update.mutate({ landing: event.target.value as LandingId })}
    >
      {LANDINGS.map((landing) => (
        <option key={landing.id} value={landing.id}>
          {landing.label}
        </option>
      ))}
    </select>
  );
}

export function DensitySegmented() {
  const viewer = useViewer();
  const update = useUpdatePreferences();
  return <Segmented<Density> small label="Detail level" options={DENSITIES.map((density) => ({ value: density.id, label: density.label }))} value={viewer.preferences.density} onChange={(density) => update.mutate({ density })} />;
}

export function HomePageTab() {
  const viewer = useViewer();
  const update = useUpdatePreferences();
  const router = useRouter();
  const { reset } = useLayoutActions();
  const { closeSettings, setCustomizing } = useUiStore.getState();
  const isExec = viewer.profile.focusAreas.includes('exec');
  return (
    <>
      <div className="setrow">
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Opens to</div>
          <div className="faint" style={{ fontSize: 12 }}>
            Your default view when you open RedSky
          </div>
        </div>
        <LandingSelect />
      </div>
      <div className="setrow">
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Detail level</div>
          <div className="faint" style={{ fontSize: 12 }}>
            How much each widget shows
          </div>
        </div>
        <DensitySegmented />
      </div>
      <div style={{ padding: '14px 0 4px' }}>
        <div style={{ fontWeight: 500 }}>Daily Brief includes</div>
        <div className="faint" style={{ fontSize: 12 }}>
          Choose what the brief summarizes at the top of your home page
        </div>
      </div>
      {BRIEF_INCLUDES.map((entry) => {
        const label = entry.key === 'followups' && isExec ? 'Decisions waiting on you' : entry.label;
        return (
          <div className="setrow" style={{ padding: '9px 0' }} key={entry.key}>
            <span className="grow" style={{ fontSize: 13 }}>
              {label}
            </span>
            <Switch label={label} checked={viewer.preferences.briefIncludes[entry.key]} onCheckedChange={(on) => update.mutate({ briefIncludes: { ...viewer.preferences.briefIncludes, [entry.key]: on } })} />
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            closeSettings();
            router.push('/home');
            setCustomizing(true);
          }}
        >
          <Icon name="layout" size="s" />
          Customize widgets
        </button>
        <button type="button" className="btn btn-sm" onClick={reset}>
          <Icon name="refresh" size="s" />
          Reset to recommended for my role
        </button>
      </div>
    </>
  );
}

export function AiSettingsTab() {
  const viewer = useViewer();
  const update = useUpdatePreferences();
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14 }}>
        {AI_STYLES.map((style) => (
          <button key={style.id} type="button" className="sel" style={{ padding: '12px 14px', gap: 4 }} aria-pressed={viewer.preferences.aiStyle === style.id} onClick={() => update.mutate({ aiStyle: style.id })}>
            <span className="sel-chk r">
              <Icon name="check" size="xs" strokeWidth={2.6} />
            </span>
            <span style={{ fontWeight: 600 }}>{style.label}</span>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {style.desc}
            </span>
          </button>
        ))}
      </div>
      <div className="setrow" style={{ marginTop: 8 }}>
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Personalize with my email and calendar</div>
          <div className="faint" style={{ fontSize: 12 }}>
            Uses connected Microsoft 365 data you can already see
          </div>
        </div>
        <Switch label="Personalize with my email and calendar" checked={viewer.preferences.aiUseContext} onCheckedChange={(aiUseContext) => update.mutate({ aiUseContext })} />
      </div>
      <div className="setrow">
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Approved external research providers</div>
          <div className="faint" style={{ fontSize: 12 }}>
            Governed by your administrator
          </div>
        </div>
        <Switch label="Approved external research providers" checked={false} disabled />
      </div>
      <div className="note" style={{ marginTop: 12 }}>
        <Icon name="shield" size="s" style={{ marginTop: 1, color: 'var(--ok)' }} />
        <span>RedSky AI only uses information you’re authorized to access, cites sources on every answer, and asks for confirmation before changing records. External processing follows RSM Capital’s security policies.</span>
      </div>
    </>
  );
}

const NOTIFICATION_OPTIONS = [
  { key: 'prep', label: 'Meeting preparation ready', desc: 'When RedSky AI finishes a brief before a meeting' },
  { key: 'due', label: 'Tasks due and overdue', desc: 'Morning reminder and when something slips' },
  { key: 'rel', label: 'Relationship reminders', desc: 'When an important contact is cooling' },
  { key: 'pipe', label: 'Pipeline changes', desc: 'Stage changes on deals you follow' },
  { key: 'gov', label: 'Government affairs alerts', desc: 'Changes to legislation and proceedings you track' },
] as const;

export function NotificationsTab() {
  const viewer = useViewer();
  const update = useUpdatePreferences();
  return (
    <>
      {NOTIFICATION_OPTIONS.map((option) => (
        <div className="setrow" key={option.key}>
          <div className="grow">
            <div style={{ fontWeight: 500 }}>{option.label}</div>
            <div className="faint" style={{ fontSize: 12 }}>
              {option.desc}
            </div>
          </div>
          <Switch label={option.label} checked={viewer.preferences.notifications[option.key]} onCheckedChange={(on) => update.mutate({ notifications: { ...viewer.preferences.notifications, [option.key]: on } })} />
        </div>
      ))}
      <div className="setrow">
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Non-urgent notifications</div>
          <div className="faint" style={{ fontSize: 12 }}>
            Urgent items always arrive immediately
          </div>
        </div>
        <Segmented<NotifMode>
          small
          label="Non-urgent notifications"
          options={[
            { value: 'realtime', label: 'Real-time' },
            { value: 'batched', label: 'Batched · 9 AM & 3 PM' },
          ]}
          value={viewer.preferences.notifMode}
          onChange={(notifMode) => update.mutate({ notifMode })}
        />
      </div>
      <div className="setrow">
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Daily Brief delivery</div>
          <div className="faint" style={{ fontSize: 12 }}>
            Also sent to Teams when connected
          </div>
        </div>
        <select className="input" style={{ width: 'auto', height: 30, fontSize: 12.5 }} aria-label="Daily Brief delivery time" value={viewer.preferences.digestTime} onChange={(event) => update.mutate({ digestTime: event.target.value as (typeof DIGEST_TIMES)[number] })}>
          {DIGEST_TIMES.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

const CHIP_TONE: Record<string, ChipTone> = { ok: 'ok', outline: 'outline', warn: 'warn', neutral: 'neutral' };

export function ConnectedAppsTab() {
  const viewer = useViewer();
  const { notify, stateOf } = useConnectorActions();
  return (
    <>
      <CrmConnectionRow />
      <div className="note" style={{ margin: '14px 0 6px' }}>
        <Icon name="alert" size="s" style={{ marginTop: 1 }} />
        <span>
          The connectors below are coming soon. Choose Notify me and RedSky will tell you when each one is ready.
          {viewer.config.dataMode === 'demo' ? ' Records shown in this demo are sample data.' : ' Until then, widgets that need them show what connecting would enable.'}
        </span>
      </div>
      {CONNECTORS.map((connector) => {
        const view = CONNECTOR_STATE_VIEW[stateOf(connector.id)];
        return (
          <div className="setrow" style={{ gap: 12 }} key={connector.id}>
            <ConnectorLogo connector={connector} size={32} />
            <div className="grow">
              <div style={{ fontWeight: 500 }}>{connector.name}</div>
              <div className="faint ell" style={{ fontSize: 12 }}>
                {connector.enables}
              </div>
            </div>
            <Chip tone={CHIP_TONE[view.chip] ?? 'neutral'} dot className="hide-sm">
              {view.label}
            </Chip>
            <button type="button" className={`btn btn-sm ${view.actionVariant === 'ghost' ? 'btn-g' : view.actionVariant === 'primary' ? 'btn-p' : ''}`} disabled={view.disabled} onClick={() => notify(connector.id)}>
              {view.action}
            </button>
          </div>
        );
      })}
    </>
  );
}
