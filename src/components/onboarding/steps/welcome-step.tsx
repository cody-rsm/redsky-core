'use client';

import { Icon } from '@/components/ui/icon';
import { RedSkyMarkPaths } from '@/components/ui/redsky-mark';
import { WELCOME_PREVIEW } from '@/features/onboarding/steps';
import { useViewer } from '@/lib/client/viewer';
import { viewerDisplay } from '@/lib/client/viewer-display';
import type { StepNavigation } from '../onboarding-flow';

const SPOKES: ReadonlyArray<[number, number]> = [
  [260, 80],
  [366, 124],
  [410, 230],
  [366, 336],
  [260, 380],
  [154, 336],
  [110, 230],
  [154, 124],
];
const INNER: ReadonlyArray<[number, number, number, number]> = [
  [342.7, 200, 410, 230],
  [290, 312.7, 366, 336],
  [177.3, 260, 154, 336],
  [230, 147.3, 154, 124],
];
const PULSES: ReadonlyArray<[number, number, string]> = [
  [313, 177, '0s'],
  [207, 283, '.8s'],
  [335, 230, '1.6s'],
  [260, 155, '2.2s'],
  [185, 230, '1.2s'],
  [313, 283, '.4s'],
];

export function WelcomeStep({ navigation }: { navigation: StepNavigation }) {
  const viewer = useViewer();
  const name = viewerDisplay(viewer).greetingName;
  return (
    <div className="a-in" style={{ minHeight: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(440px,100%),1fr))', alignItems: 'center', gap: 48, maxWidth: 1180, margin: '0 auto', padding: '48px 40px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="rule" />
          <span className="lbl" style={{ color: 'var(--act)' }}>
            RSM Capital · Internal operating system
          </span>
        </div>
        <h1 className="serif" style={{ fontSize: 54, lineHeight: 1.04 }}>
          Welcome to RedSky{name === 'there' ? '' : `, ${name}`}.
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.5, color: 'var(--tx)' }}>Your work, relationships, intelligence, and opportunities — all in one place.</p>
        <p style={{ color: 'var(--tx2)', fontSize: 14.5, lineHeight: 1.6, textWrap: 'pretty' }}>
          RedSky connects RSM’s relationships, investments, projects and institutional knowledge in a single workspace, with an AI assistant that works only from what you’re authorized to see. Let’s tailor it to how you work.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0', borderTop: '1px solid var(--bd)', borderBottom: '1px solid var(--bd)' }}>
          {WELCOME_PREVIEW.map((item) => (
            <div key={item.text} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="tile tile-s">
                <Icon name={item.icon} size="s" />
              </span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-p btn-lg" onClick={navigation.next}>
            Get started
            <Icon name="arrowR" />
          </button>
          <span className="faint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <Icon name="clock" size="s" />
            About 5 minutes · 9 short steps
          </span>
        </div>
      </div>
      <div aria-hidden="true" style={{ background: '#231714', borderRadius: 20, padding: '18px 18px 22px', boxShadow: 'var(--shl)', position: 'relative', overflow: 'hidden' }}>
        <svg viewBox="0 0 520 460" style={{ width: '100%', height: 'auto', display: 'block' }}>
          <circle cx="260" cy="230" r="150" fill="none" stroke="rgba(236,220,185,.16)" strokeDasharray="2 6" />
          <circle cx="260" cy="230" r="88" fill="none" stroke="rgba(236,220,185,.12)" />
          <circle cx="260" cy="230" r="205" fill="none" stroke="rgba(236,220,185,.06)" />
          <g stroke="rgba(236,220,185,.22)" strokeWidth="1">
            {SPOKES.map(([x, y]) => (
              <line key={`${x}-${y}`} x1="260" y1="230" x2={x} y2={y} />
            ))}
            <path d="M260 80 Q 330 90 366 124" fill="none" stroke="rgba(148,27,30,.7)" />
            <path d="M366 336 Q 300 380 260 380" fill="none" stroke="rgba(148,27,30,.7)" />
            <path d="M110 230 Q 120 160 154 124" fill="none" stroke="rgba(148,27,30,.7)" />
            {INNER.map(([x1, y1, x2, y2]) => (
              <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>
          <g fill="#ECDCB9">
            {INNER.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="3" opacity=".7" />
            ))}
            {PULSES.map(([x, y, delay]) => (
              <circle key={`${x}-${y}`} className="pulse" cx={x} cy={y} r="2.4" style={{ animationDelay: delay }} />
            ))}
          </g>
          <g fill="#EEEBDF" stroke="rgba(236,220,185,.35)" strokeWidth="7" paintOrder="stroke">
            {SPOKES.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />
            ))}
          </g>
          <g fontFamily="var(--rs-font-sans), system-ui, sans-serif" fontSize="10.5" letterSpacing="1.4" fill="#ECDCB9" opacity=".88">
            <text x="260" y="60" textAnchor="middle">
              RELATIONSHIPS
            </text>
            <text x="380" y="114">
              INVESTMENTS
            </text>
            <text x="424" y="234">
              PORTFOLIO
            </text>
            <text x="380" y="348">
              ENERGY &amp;
            </text>
            <text x="380" y="362">
              INFRASTRUCTURE
            </text>
            <text x="260" y="406" textAnchor="middle">
              GOVERNMENT AFFAIRS
            </text>
            <text x="140" y="350" textAnchor="end">
              PROJECTS
            </text>
            <text x="96" y="234" textAnchor="end">
              DOCUMENTS
            </text>
            <text x="140" y="114" textAnchor="end">
              INTELLIGENCE
            </text>
          </g>
          <g transform="translate(232 200) scale(1.75)">
            <RedSkyMarkPaths />
          </g>
        </svg>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, padding: '0 6px', flexWrap: 'wrap' }}>
          <div className="serif" style={{ color: '#EEEBDF', fontSize: 19, lineHeight: 1.3, maxWidth: 340 }}>
            One workspace. Every relationship. Every opportunity.
          </div>
          <div style={{ color: '#ECDCB9', opacity: 0.75, fontSize: 10.5, letterSpacing: '.12em' }}>ALL INSTITUTIONAL KNOWLEDGE</div>
        </div>
      </div>
    </div>
  );
}
