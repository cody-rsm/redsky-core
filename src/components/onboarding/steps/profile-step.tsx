'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { DEPARTMENT_FOCUS_AREAS, DEPARTMENTS, MONOGRAM_TONES, OFFICES, type Department } from '@/features/personalization/catalog';
import { PROFILE_PHOTO_MAX_BYTES, profileFieldsSchema, type ProfileFields } from '@/features/profile/schema';
import type { DirectoryField, ProfileView } from '@/lib/api/contracts';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { useUiStore } from '@/lib/client/ui-store';
import { useRefreshViewer, useUpdatePreferences, useUpdateProfile, useViewer } from '@/lib/client/viewer';
import { viewerDisplay } from '@/lib/client/viewer-display';

type TextField = Exclude<keyof ProfileFields, 'monogramTone' | 'department' | 'office'>;

function SourceTag({ profile, field }: { profile: ProfileView; field: DirectoryField }) {
  const source = profile.directorySource[field];
  if (source === 'entra') {
    return (
      <span className="src-tag">
        <Icon name="check" size="xs" />
        Entra ID
      </span>
    );
  }
  if (source === 'missing') {
    return (
      <span className="src-tag" style={{ color: 'var(--wn)' }}>
        Missing from directory
      </span>
    );
  }
  return null;
}

export function ProfileStep() {
  const viewer = useViewer();
  const profile = viewer.profile;
  const display = viewerDisplay(viewer);
  const updateProfile = useUpdateProfile();
  const updatePreferences = useUpdatePreferences();
  const refreshViewer = useRefreshViewer();
  const toast = useUiStore((state) => state.toast);
  const { register, getValues, trigger, control, formState } = useForm<ProfileFields>({
    resolver: zodResolver(profileFieldsSchema),
    mode: 'onBlur',
    defaultValues: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      preferredName: profile.preferredName,
      title: profile.title,
      department: (DEPARTMENTS as ReadonlyArray<string>).includes(profile.department) ? (profile.department as Department) : '',
      phone: profile.phone,
      office: OFFICES.some((office) => office.value === profile.office) ? profile.office : '',
      bio: profile.bio,
      monogramTone: profile.monogramTone,
    },
  });
  const bio = useWatch({ control, name: 'bio' }) ?? '';

  // Each field saves on its own once it is valid, so nothing typed is lost if the page is closed.
  async function saveField(field: TextField | 'department' | 'office') {
    if (!(await trigger(field))) return;
    const value = getValues(field);
    if (value === profile[field]) return;
    updateProfile.mutate({ [field]: value });
    if (field === 'department' && value) updatePreferences.mutate({ focusAreas: [...DEPARTMENT_FOCUS_AREAS[value as Department]] });
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > PROFILE_PHOTO_MAX_BYTES) return toast('Photos can be up to 2 MB');
    const form = new FormData();
    form.set('photo', file);
    try {
      await apiFetch('/api/me/photo', { method: 'POST', form });
      await refreshViewer();
    } catch (error) {
      toast(errorMessage(error));
    }
  }

  async function removePhoto() {
    try {
      await apiFetch('/api/me/photo', { method: 'DELETE' });
      await refreshViewer();
    } catch (error) {
      toast(errorMessage(error));
    }
  }

  const textField = (field: TextField, label: string, options: { placeholder?: string; source?: DirectoryField; type?: string; help?: string } = {}) => (
    <div className="field">
      <label htmlFor={`f-${field}`}>
        {label}
        {options.source ? <SourceTag profile={profile} field={options.source} /> : null}
      </label>
      <input id={`f-${field}`} className="input" type={options.type ?? 'text'} placeholder={options.placeholder} aria-invalid={Boolean(formState.errors[field])} {...register(field, { onBlur: () => void saveField(field) })} />
      {formState.errors[field] ? <span className="field-err">{formState.errors[field]?.message}</span> : null}
      {options.help ? (
        <span className="faint" style={{ fontSize: 11.5 }}>
          {options.help}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="ob-inner a-in">
      <span className="lbl">Step 2 · Profile</span>
      <h1 className="ob-h serif">Confirm your profile</h1>
      <p className="ob-sub">
        {viewer.user.authProvider === 'entra'
          ? 'We’ve prefilled what we could from Microsoft Entra ID. Confirm or update anything that’s out of date — colleagues see this profile across RedSky.'
          : 'Confirm or update your details — colleagues see this profile across RedSky.'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 28, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '1 1 220px', maxWidth: 300, padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <Avatar initials={display.initials} tone={normalizeTone(display.tone)} size="xl" photoUrl={display.photoUrl} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{display.fullName}</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              {profile.title || 'Add your title'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <label className="btn btn-sm" style={{ position: 'relative', overflow: 'hidden' }}>
              <Icon name="camera" size="s" />
              Upload photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                aria-label="Upload a profile photo"
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                onChange={(event) => {
                  void uploadPhoto(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            {display.photoUrl ? (
              <button type="button" className="btn btn-g btn-sm" onClick={() => void removePhoto()}>
                Remove
              </button>
            ) : null}
          </div>
          <div style={{ width: '100%', borderTop: '1px solid var(--bd)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <span className="faint" style={{ fontSize: 11.5 }}>
              Monogram color
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {MONOGRAM_TONES.map((tone) => {
                const on = profile.monogramTone === tone;
                return (
                  <button
                    key={tone}
                    type="button"
                    className={`av av-sm av-${tone}`}
                    aria-pressed={on}
                    aria-label={`Monogram color ${tone + 1}`}
                    onClick={() => updateProfile.mutate({ monogramTone: tone })}
                    style={{ cursor: 'pointer', outlineOffset: 2, boxShadow: on ? '0 0 0 2px var(--sf), 0 0 0 4px var(--act)' : 'none' }}
                  />
                );
              })}
            </div>
          </div>
        </div>
        <form className="card" onSubmit={(event) => event.preventDefault()} noValidate style={{ flex: '999 1 440px', padding: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(230px,100%),1fr))', gap: 16 }}>
          {textField('firstName', 'Name', { placeholder: 'First name', source: 'firstName' })}
          {textField('lastName', 'Last name', { placeholder: 'Add your last name', source: 'lastName' })}
          {textField('preferredName', 'Preferred name', { placeholder: 'What colleagues call you', help: 'Used in greetings and your Daily Brief.' })}
          {textField('title', 'Professional title', { placeholder: 'e.g. Director, Government Affairs', source: 'title' })}
          <div className="field">
            <label htmlFor="f-dept">
              Department or team
              <SourceTag profile={profile} field="department" />
            </label>
            <select id="f-dept" className="input" {...register('department', { onChange: () => void saveField('department') })}>
              <option value="">Select a department</option>
              {DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-email">
              Email address
              <span className="src-tag">
                <Icon name="lock" size="xs" />
                Managed by IT
              </span>
            </label>
            <input id="f-email" className="input" value={profile.email} readOnly />
          </div>
          {textField('phone', 'Phone number', { placeholder: 'Add a direct line', type: 'tel', source: 'phone' })}
          <div className="field">
            <label htmlFor="f-office">
              Office / location
              <SourceTag profile={profile} field="office" />
            </label>
            <select id="f-office" className="input" {...register('office', { onChange: () => void saveField('office') })}>
              {OFFICES.map((office) => (
                <option key={office.value} value={office.value}>
                  {office.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1/-1' }}>
            <label htmlFor="f-bio">
              Short professional biography
              <span className="src-tag num">{bio.length} / 280</span>
            </label>
            <textarea
              id="f-bio"
              className="input"
              rows={3}
              maxLength={280}
              placeholder="A sentence or two on your focus areas, sectors and the relationships you manage."
              aria-invalid={Boolean(formState.errors.bio)}
              {...register('bio', { onBlur: () => void saveField('bio') })}
            />
            {formState.errors.bio ? <span className="field-err">{formState.errors.bio.message}</span> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
