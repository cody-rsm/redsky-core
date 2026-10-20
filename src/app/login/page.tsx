import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DevSignIn } from '@/components/auth/dev-sign-in';
import { Icon } from '@/components/ui/icon';
import { RedSkyMark } from '@/components/ui/redsky-mark';
import { DEMO_PERSONA_ORDER, DEMO_PERSONAS } from '@/demo/personas';
import { sanitizeReturnTo } from '@/server/auth/entra';
import { getSessionUser } from '@/server/auth/session';
import { getConfig } from '@/server/config/env';

export const metadata: Metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  denied: 'Sign-in was cancelled or not permitted for this account.',
  signin_failed: 'We couldn’t complete sign-in. Please try again.',
  not_configured: 'Sign-in isn’t configured for this environment yet.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(typeof params.returnTo === 'string' ? params.returnTo : '/');
  if (await getSessionUser()) redirect(returnTo);
  const config = getConfig();
  const error = typeof params.error === 'string' ? ERRORS[params.error] : undefined;
  const personas = DEMO_PERSONA_ORDER.map((id) => {
    const persona = DEMO_PERSONAS[id];
    return { id, name: [persona.first, persona.last].filter(Boolean).join(' '), title: persona.title, tone: persona.tone, label: persona.label, primary: persona.primary };
  });

  return (
    <div className="auth">
      <header className="ob-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RedSkyMark size={28} />
          <span className="serif" style={{ fontSize: 20, lineHeight: 1 }}>
            RedSky
          </span>
        </div>
        <div className="grow" />
        <span className="chip chip-o hide-sm">
          <Icon name="lock" size="xs" />
          Confidential · RSM Capital internal
        </span>
      </header>
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
        <div className="auth-card a-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="rule" />
            <span className="lbl" style={{ color: 'var(--act)' }}>
              RSM Capital · Internal operating system
            </span>
          </div>
          <h1 className="serif" style={{ fontSize: 32, lineHeight: 1.1 }}>
            Sign in to RedSky
          </h1>
          {error ? (
            <div className="note note-wn" role="alert">
              <Icon name="alert" size="s" style={{ marginTop: 1, color: 'var(--wn)' }} />
              <span>{error}</span>
            </div>
          ) : null}
          {config.auth.mode === 'entra' ? (
            <>
              <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                Use your RSM Capital Microsoft account. Access follows your Microsoft Entra ID permissions.
              </p>
              <a className="btn btn-p btn-lg" href={`/api/auth/entra/start?returnTo=${encodeURIComponent(returnTo)}`}>
                Continue with Microsoft
                <Icon name="arrowR" />
              </a>
            </>
          ) : null}
          {config.auth.mode === 'dev' ? <DevSignIn personas={personas} returnTo={returnTo} /> : null}
          {config.auth.mode === 'none' ? (
            <div className="note" role="status">
              <Icon name="shield" size="s" style={{ marginTop: 1 }} />
              <span>
                Sign-in isn’t configured for this environment, so RedSky is locked. An administrator needs to finish the Microsoft Entra ID setup before anyone can use it.
              </span>
            </div>
          ) : null}
          <div className="faint" style={{ fontSize: 11.5, display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 1.45 }}>
            <Icon name="lock" size="xs" style={{ marginTop: 2 }} />
            <span>RedSky shows only records you’re authorized to access. Activity is recorded in the audit log.</span>
          </div>
        </div>
      </main>
    </div>
  );
}
