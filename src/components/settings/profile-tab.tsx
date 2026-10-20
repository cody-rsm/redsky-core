'use client';

import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { FOCUS_AREA_SHORT, OFFICES } from '@/features/personalization/catalog';
import { profileFieldsSchema, type ProfilePatch } from '@/features/profile/schema';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { useUiStore } from '@/lib/client/ui-store';
import { useUpdateProfile, useViewer } from '@/lib/client/viewer';
import { viewerDisplay } from '@/lib/client/viewer-display';

type TextField = 'firstName' | 'lastName' | 'preferredName' | 'title' | 'phone';

const FIELDS: ReadonlyArray<{ key: TextField; label: string; placeholder?: string }> = [
  { key: 'firstName', label: 'Name' },
  { key: 'lastName', label: 'Last name', placeholder: 'Add your last name' },
  { key: 'preferredName', label: 'Preferred name' },
  { key: 'title', label: 'Title' },
  { key: 'phone', label: 'Phone', placeholder: 'Add a direct line' },
];

export function ProfileTab() {
  const viewer = useViewer();
  const display = viewerDisplay(viewer);
  const router = useRouter();
  const updateProfile = useUpdateProfile();
  const { openSettings, toast, closeSettings, requestConfirm } = useUiStore.getState();
  const focus = viewer.profile.focusAreas.map((area) => FOCUS_AREA_SHORT[area]).join(', ') || 'Not set';

  function save(patch: ProfilePatch) {
    const parsed = profileFieldsSchema.partial().safeParse(patch);
    if (!parsed.success) return toast(parsed.error.issues[0]?.message ?? 'That value isn’t valid');
    if (patch.firstName !== undefined && !patch.firstName.trim()) return toast('Your first name can’t be empty');
    updateProfile.mutate(parsed.data);
  }

  function restart() {
    requestConfirm({
      title: 'Restart onboarding?',
      body: 'You’ll walk through setup again. Your current profile and settings are kept, and you can change them as you go.',
      items: [],
      ok: 'Restart onboarding',
      run: async () => {
        try {
          await apiFetch('/api/onboarding/restart', { method: 'POST' });
          closeSettings();
          router.push('/onboarding/welcome');
        } catch (error) {
          toast(errorMessage(error));
        }
      },
    });
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 0' }}>
        <Avatar initials={display.initials} tone={display.tone} size="lg" photoUrl={display.photoUrl} style={{ width: 52, height: 52, fontSize: 18 }} />
        <div className="grow">
          <div style={{ fontWeight: 600, fontSize: 15 }}>{display.fullName}</div>
          <div className="faint" style={{ fontSize: 12.5 }}>
            {viewer.profile.title} · {viewer.profile.email}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 14 }}>
        {FIELDS.map((field) => (
          <div className="field" key={field.key}>
            <label htmlFor={`s-${field.key}`}>{field.label}</label>
            <input
              id={`s-${field.key}`}
              className="input"
              defaultValue={viewer.profile[field.key]}
              placeholder={field.placeholder}
              onBlur={(event) => {
                if (event.target.value !== viewer.profile[field.key]) save({ [field.key]: event.target.value });
              }}
            />
          </div>
        ))}
        <div className="field">
          <label htmlFor="s-office">Office</label>
          <select id="s-office" className="input" value={viewer.profile.office} onChange={(event) => save({ office: event.target.value })}>
            {OFFICES.map((office) => (
              <option key={office.value} value={office.value}>
                {office.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="setrow" style={{ marginTop: 12 }}>
        <div className="grow">
          <div style={{ fontWeight: 500 }}>My Workstyle</div>
          <div className="faint" style={{ fontSize: 12 }}>
            Private assessment insights and the recommendations you’ve chosen
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => openSettings('workstyle')}>
          <Icon name="compass" size="s" />
          Open
        </button>
      </div>
      <div className="setrow">
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Focus areas</div>
          <div className="faint" style={{ fontSize: 12 }}>
            {focus}
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={restart}>
          <Icon name="refresh" size="s" />
          Restart onboarding
        </button>
      </div>
      <div className="setrow">
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Sign out</div>
          <div className="faint" style={{ fontSize: 12 }}>
            End your RedSky session on this device
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
            // A full page load drops every cached view of the signed-out session.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign('/login');
          }}
        >
          <Icon name="arrowUR" size="s" />
          Sign out
        </button>
      </div>
    </>
  );
}
