'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Tile } from '@/components/ui/tile';
import { contactInputSchema, type ContactInput } from '@/features/crm/schema';
import type { CrmContactReview } from '@/lib/api/contracts';
import { errorMessage } from '@/lib/client/api';
import { useCrmWrites } from '@/lib/client/crm';
import { useUiStore, type CreatePrefill } from '@/lib/client/ui-store';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';

type AddContactFormProps = { prefill: CreatePrefill; onClose: () => void };

const NEW_ORGANIZATION = 'new';

// Adds a person to the CRM as the signed-in employee, in two steps: fill in, then review what will be written
// (possible duplicates, and whether the organization exists or is new) before anything is saved.
export function AddContactForm({ prefill, onClose }: AddContactFormProps) {
  const { reviewContact, addContact } = useCrmWrites();
  const { openRecord } = useWorkspaceActions();
  const toast = useUiStore((state) => state.toast);
  // One key per form, so a retried or double-clicked save adds the contact once.
  const [requestKey] = useState(() => crypto.randomUUID());
  const [review, setReview] = useState<{ input: ContactInput; result: CrmContactReview } | null>(null);
  const [organizationChoice, setOrganizationChoice] = useState<string>(NEW_ORGANIZATION);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, formState } = useForm<z.input<typeof contactInputSchema>, unknown, ContactInput>({
    resolver: zodResolver(contactInputSchema),
    defaultValues: { fullName: prefill.title, email: '', jobTitle: '', organization: prefill.related, note: prefill.notes },
  });

  async function onReview(input: ContactInput) {
    setProblem(null);
    try {
      const result = await reviewContact(input);
      setOrganizationChoice(result.organizations[0]?.id ?? NEW_ORGANIZATION);
      setReview({ input, result });
    } catch (error) {
      setProblem(errorMessage(error));
    }
  }

  async function onConfirm() {
    if (!review || saving) return;
    setSaving(true);
    setProblem(null);
    const organizationId = review.input.organization && organizationChoice !== NEW_ORGANIZATION ? organizationChoice : null;
    try {
      const result = await addContact(review.input, { organizationId, createOrganization: Boolean(review.input.organization) && !organizationId }, requestKey);
      toast(result.message);
      onClose();
    } catch (error) {
      setProblem(errorMessage(error));
      setSaving(false);
    }
  }

  const header = (
    <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 14px 18px', borderBottom: '1px solid var(--bd)' }}>
      <Tile icon="user" small />
      <DialogTitle className="grow" style={{ fontSize: 15, fontWeight: 600 }}>
        {review ? 'Review contact' : 'Add contact'}
      </DialogTitle>
      <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close" onClick={onClose}>
        <Icon name="x" size="s" />
      </button>
    </header>
  );
  const problemLine = problem ? (
    <p role="alert" className="field-err">
      {problem}
    </p>
  ) : null;

  if (review) {
    const { input, result } = review;
    return (
      <div>
        {header}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {result.duplicates.length > 0 ? (
            <div className="note note-wn" role="status">
              <Icon name="alert" size="s" style={{ marginTop: 1, color: 'var(--wn)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>{result.duplicates.length === 1 ? 'This person may already be in the CRM:' : 'These people may already be in the CRM:'}</span>
                {result.duplicates.map((duplicate) => (
                  <div key={duplicate.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="grow">
                      <b>{duplicate.name}</b>
                      {[duplicate.email, duplicate.organization].filter(Boolean).length > 0 ? ` · ${[duplicate.email, duplicate.organization].filter(Boolean).join(' · ')}` : ''}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        onClose();
                        openRecord('contact', duplicate.id);
                      }}
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="field">
            <span className="flabel">Contact</span>
            <span>
              <b>{input.fullName}</b>
              {[input.jobTitle, input.email].filter(Boolean).length > 0 ? ` · ${[input.jobTitle, input.email].filter(Boolean).join(' · ')}` : ''}
            </span>
          </div>
          {input.organization ? (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="flabel">Organization</legend>
              {result.organizations.map((organization) => (
                <label key={organization.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="radio" name="organization" value={organization.id} checked={organizationChoice === organization.id} onChange={() => setOrganizationChoice(organization.id)} />
                  <span>
                    {organization.name}
                    {organization.domain ? <span className="faint"> · {organization.domain}</span> : null}
                    <span className="faint"> · already in the CRM</span>
                  </span>
                </label>
              ))}
              {result.organizations.length > 0 ? (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="radio" name="organization" value={NEW_ORGANIZATION} checked={organizationChoice === NEW_ORGANIZATION} onChange={() => setOrganizationChoice(NEW_ORGANIZATION)} />
                  <span>Add “{input.organization}” as a new organization</span>
                </label>
              ) : (
                <span>“{input.organization}” isn’t in the CRM yet. It will be added as a new organization.</span>
              )}
            </fieldset>
          ) : null}
          {input.note ? <div className="faint">Your note will be added to the contact.</div> : null}
          <div className="note" style={{ fontSize: 12 }}>
            <Icon name="shield" size="s" style={{ marginTop: 1 }} />
            <span>Saved to the RSM CRM as you, under your CRM permissions.</span>
          </div>
          {problemLine}
        </div>
        <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--bd)', background: 'var(--bg)' }}>
          <button type="button" className="btn" disabled={saving} onClick={() => setReview(null)}>
            Back
          </button>
          <button type="button" className="btn btn-p" disabled={saving} onClick={() => void onConfirm()}>
            {saving ? <Icon name="refresh" size="s" className="spin" /> : null}
            {result.duplicates.length > 0 ? 'Add anyway' : 'Add to CRM'}
          </button>
        </footer>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onReview)} noValidate>
      {header}
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="contact-name">Full name</label>
          <input id="contact-name" className="input" autoFocus placeholder="e.g. Jordan Alvarez" aria-invalid={Boolean(formState.errors.fullName)} {...register('fullName')} />
          {formState.errors.fullName ? <span className="field-err">{formState.errors.fullName.message}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="contact-email">Email</label>
          <input id="contact-email" className="input" type="email" placeholder="Optional, helps find duplicates" aria-invalid={Boolean(formState.errors.email)} {...register('email')} />
          {formState.errors.email ? <span className="field-err">{formState.errors.email.message}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="contact-title">Job title</label>
          <input id="contact-title" className="input" placeholder="Optional" {...register('jobTitle')} />
        </div>
        <div className="field">
          <label htmlFor="contact-org">Organization</label>
          <input id="contact-org" className="input" placeholder="Optional" {...register('organization')} />
        </div>
        <div className="field">
          <label htmlFor="contact-note">Notes</label>
          <textarea id="contact-note" className="input" rows={3} placeholder="Optional context for colleagues" aria-invalid={Boolean(formState.errors.note)} {...register('note')} />
          {formState.errors.note ? <span className="field-err">{formState.errors.note.message}</span> : null}
        </div>
        <div className="note" style={{ fontSize: 12 }}>
          <Icon name="shield" size="s" style={{ marginTop: 1 }} />
          <span>RedSky checks the CRM for duplicates and shows you what will be added before saving.</span>
        </div>
        {problemLine}
      </div>
      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--bd)', background: 'var(--bg)' }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-p" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Icon name="refresh" size="s" className="spin" /> : null}
          Review
        </button>
      </footer>
    </form>
  );
}
