'use client';

import { useState } from 'react';
import { Avatar, initialsFromName } from '@/components/ui/avatar';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { apiFetch, errorMessage } from '@/lib/client/api';

type Persona = { id: 'ga' | 'vc' | 'exec'; name: string; title: string; tone: number; label: string; primary: boolean };

// Development-only. The server answers 404 for this flow in any production build.
export function DevSignIn({ personas, returnTo }: { personas: Persona[]; returnTo: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(persona: Persona['id']) {
    setBusy(persona);
    setError(null);
    try {
      await apiFetch('/api/auth/dev/login', { method: 'POST', body: { persona } });
      window.location.assign(returnTo);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="note note-wn">
        <Icon name="alert" size="s" style={{ marginTop: 1, color: 'var(--wn)' }} />
        <span>
          <b>Development sign-in.</b> Sign in as one of the prototype’s demo profiles. This option does not exist in production builds.
        </span>
      </div>
      {personas.map((persona) => (
        <button key={persona.id} type="button" className="mi" style={{ border: '1px solid var(--bd)', padding: '10px 12px' }} disabled={busy !== null} onClick={() => signIn(persona.id)}>
          <Avatar initials={initialsFromName(persona.name)} tone={persona.tone} />
          <span className="grow" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
            <span style={{ fontWeight: 500, display: 'flex', gap: 6, alignItems: 'center' }}>
              {persona.name}
              {persona.primary ? <Chip tone="accent" small>Primary example</Chip> : null}
            </span>
            <span className="faint" style={{ fontSize: 11.5 }}>
              {persona.label} · {persona.title}
            </span>
          </span>
          {busy === persona.id ? <Icon name="refresh" size="s" className="spin" /> : <Icon name="arrowR" size="s" className="faint" />}
        </button>
      ))}
      {error ? (
        <p role="alert" className="field-err">
          {error}
        </p>
      ) : null}
    </div>
  );
}
