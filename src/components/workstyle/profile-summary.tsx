import { Icon } from '@/components/ui/icon';
import { DISC_FACTORS, WORK_PREFERENCE_FIELDS } from '@/features/workstyle/catalog';
import { discStyleNote, drivingForceViews, primaryDrivers, type WorkstyleProfile } from '@/features/workstyle/profile';

export function DiscBars({ profile, compact }: { profile: WorkstyleProfile; compact?: boolean }) {
  return (
    <>
      {DISC_FACTORS.map((factor) => {
        const score = profile.disc[factor.key];
        return (
          <div key={factor.key} style={{ display: 'grid', gridTemplateColumns: compact ? '18px minmax(0,1fr) 48px' : '22px minmax(0,1fr) 54px', gap: compact ? 8 : 10, alignItems: 'center' }}>
            <span className="serif" style={{ fontSize: compact ? undefined : 18, color: 'var(--act)' }}>
              {factor.key}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: compact ? 3 : 4, minWidth: 0 }}>
              {compact ? null : <span style={{ fontSize: 12, fontWeight: 500 }}>{factor.name}</span>}
              <span className="dbar" role="img" aria-label={`${factor.name} natural ${score.natural}`}>
                <span style={{ width: `${score.natural}%`, background: 'var(--ac)' }} />
              </span>
              <span className="dbar" role="img" aria-label={`${factor.name} adapted ${score.adapted}`}>
                <span style={{ width: `${score.adapted}%`, background: 'var(--bd2)' }} />
              </span>
            </span>
            <span className="faint num" style={{ fontSize: compact ? 11 : 11.5, textAlign: 'right' }}>
              {score.natural} / {score.adapted}
            </span>
          </div>
        );
      })}
    </>
  );
}

export function DiscLegend() {
  return (
    <div className="faint" style={{ fontSize: 11, display: 'flex', gap: 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 10, height: 4, borderRadius: 2, background: 'var(--ac)' }} />
        Natural
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 10, height: 4, borderRadius: 2, background: 'var(--bd2)' }} />
        Adapted
      </span>
    </div>
  );
}

export function PrimaryDriverChips({ profile, label = 'Primary' }: { profile: WorkstyleProfile; label?: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
      <span className="faint" style={{ fontSize: 11.5 }}>
        {label}
      </span>
      {primaryDrivers(profile).map((driver) => (
        <span key={driver} className="chip chip-ac">
          {driver}
        </span>
      ))}
    </div>
  );
}

// Onboarding results card: DISC, Driving Forces and work preferences side by side (prototype step 4).
export function ProfileOverview({ profile }: { profile: WorkstyleProfile }) {
  return (
    <div className="card" style={{ marginTop: 24, padding: '20px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(290px,100%),1fr))', gap: 26 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="lbl">DISC · natural vs adapted</span>
        <DiscBars profile={profile} />
        <DiscLegend />
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          {discStyleNote(profile)}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="lbl">12 Driving Forces</span>
        {drivingForceViews(profile).map((force) => (
          <div key={force.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }} title={force.motivator}>
            <span className="pole" data-strong={force.leftStrong}>
              {force.left}
            </span>
            <span className="ftrack" role="img" aria-label={`${force.motivator}: ${force.position} of 100 toward ${force.right}`}>
              <span className="fmark" style={{ left: `${force.position}%` }} />
            </span>
            <span className="pole" data-strong={force.rightStrong} style={{ textAlign: 'right' }}>
              {force.right}
            </span>
          </div>
        ))}
        <PrimaryDriverChips profile={profile} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="lbl">How you tend to work</span>
        {WORK_PREFERENCE_FIELDS.filter((field) => profile.preferences[field.key]).map((field) => (
          <div key={field.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon name={field.icon} size="s" className="faint" style={{ marginTop: 2 }} />
            <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              <span style={{ fontWeight: 600, display: 'block' }}>{field.label}</span>
              <span className="muted">{profile.preferences[field.key]}</span>
            </span>
          </div>
        ))}
        {WORK_PREFERENCE_FIELDS.every((field) => !profile.preferences[field.key]) ? <p className="faint" style={{ fontSize: 12 }}>No work preferences were recorded.</p> : null}
      </div>
    </div>
  );
}

// Settings › My Workstyle: compact two-column summary.
export function ProfileCompact({ profile }: { profile: WorkstyleProfile }) {
  const preferences = WORK_PREFERENCE_FIELDS.filter((field) => profile.preferences[field.key]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))', gap: 20, padding: '14px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="lbl">DISC · natural / adapted</span>
        <DiscBars profile={profile} compact />
        <div style={{ marginTop: 4 }}>
          <PrimaryDriverChips profile={profile} label="Primary drivers" />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="lbl">How you tend to work</span>
        {preferences.map((field) => (
          <div key={field.key} style={{ fontSize: 12, lineHeight: 1.45 }}>
            <span style={{ fontWeight: 600 }}>{field.label} · </span>
            <span className="muted">{profile.preferences[field.key]}</span>
          </div>
        ))}
        {preferences.length === 0 ? <p className="faint" style={{ fontSize: 12 }}>No work preferences were recorded.</p> : null}
      </div>
    </div>
  );
}
