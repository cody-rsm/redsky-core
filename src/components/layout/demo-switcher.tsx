'use client';

import { useQueryClient } from '@tanstack/react-query';
import { DropdownMenu } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import type { DemoPersonaId } from '@/features/preferences/schema';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { viewerDisplay } from '@/lib/client/viewer-display';

// Demo-mode only (SPEC §5.4): a presentation control, visibly separate from the product, never rendered in
// production mode.
export function DemoSwitcher() {
  const viewer = useViewer();
  const router = useRouter();
  const client = useQueryClient();
  const open = useUiStore((state) => state.demoOpen);
  const { setPopover, toast, resetAi } = useUiStore.getState();
  if (!viewer.demo) return null;
  const demo = viewer.demo;
  const active = demo.personas.find((persona) => persona.id === demo.activePersona);
  const firstName = viewerDisplay(viewer).greetingName;

  async function switchTo(persona: DemoPersonaId) {
    try {
      const result = await apiFetch<{ ok: true; switchedUser: boolean }>('/api/demo/persona', { method: 'POST', body: { persona } });
      const next = demo.personas.find((entry) => entry.id === persona);
      resetAi();
      if (result.switchedUser) {
        // A different signed-in person: start from a clean page so nothing from the previous persona lingers.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/');
        return;
      }
      await client.invalidateQueries();
      router.push('/home');
      if (next) toast(`Viewing RedSky as ${next.name} — ${next.label}`);
    } catch (error) {
      toast(errorMessage(error));
    }
  }

  async function restartOnboarding() {
    try {
      await apiFetch('/api/onboarding/restart', { method: 'POST' });
      await client.invalidateQueries();
      router.push('/onboarding/welcome');
    } catch (error) {
      toast(errorMessage(error));
    }
  }

  return (
    <div className="demo">
      <DropdownMenu.Root open={open} onOpenChange={(next) => setPopover(next ? 'demo' : null)} modal={false}>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="demo-pill">
            <span className="dot" style={{ color: 'var(--ac)' }} />
            Demo
            <span className="nl2 faint">
              · {active ? `${active.name.split(' ')[0]} — ${active.label}` : 'Sample data'}
            </span>
            <Icon name="chevU" size="xs" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="pop pop-r" side="top" align="end" sideOffset={8} style={{ width: 'min(340px, calc(100vw - 20px))', padding: 6, zIndex: 60 }}>
            <div style={{ padding: '8px 10px' }}>
              <div className="lbl">Demo profiles</div>
              <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                Demo control — see how home changes by role. Sample data only; not part of RedSky.
              </div>
            </div>
            {demo.personas.map((persona) => {
              const on = persona.id === demo.activePersona;
              return (
                <DropdownMenu.Item key={persona.id} className="mi" style={{ padding: '8px 10px' }} data-active={on} onSelect={() => void switchTo(persona.id)}>
                  <Avatar initials={persona.initials} tone={normalizeTone(persona.tone)} />
                  <span className="grow" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                    <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {persona.name}
                      {persona.primary ? (
                        <span className="chip chip-ac" style={{ height: 17, fontSize: 10 }}>
                          Primary example
                        </span>
                      ) : null}
                    </span>
                    <span className="faint" style={{ fontSize: 11.5 }}>
                      {persona.label} · {persona.title}
                    </span>
                  </span>
                  {on ? <Icon name="check" size="s" style={{ color: 'var(--act)' }} /> : null}
                </DropdownMenu.Item>
              );
            })}
            <DropdownMenu.Separator style={{ height: 1, background: 'var(--bd)', margin: '6px 4px' }} />
            <DropdownMenu.Item className="mi" onSelect={() => void restartOnboarding()}>
              <Icon name="refresh" className="faint" />
              Restart onboarding as {firstName}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
