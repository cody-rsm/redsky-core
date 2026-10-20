'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { DocumentUploadForm } from '@/components/documents/upload-form';
import { Modal, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Tile } from '@/components/ui/tile';
import { CREATE_DEFINITIONS, type CreateType } from '@/features/quick-create/catalog';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { useUiStore, type CreatePrefill } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';

// Sample organizations for the demo "Related to" list (prototype); production uses free text until the CRM
// supplies real records.
const DEMO_RELATED = ['Ridgeline Grid Storage', 'Halcyon Robotics', 'Atlas Transmission Co.', 'Grid Permitting Reform Coalition', 'Gulf Coast Storage Partnership', 'Lone Star Microgrid Site Selection', 'Corvid Analytics', 'Tessellate Energy', 'Meridian Water Systems', 'Brightline Ventures'];

const UNAVAILABLE_NOTE: Partial<Record<CreateType, string>> = {
  contact: 'Adding contacts needs the RSM CRM connection, which isn’t set up yet.',
  meeting: 'Logging meetings needs the RSM CRM connection, which isn’t set up yet.',
  opportunity: 'Adding opportunities needs the CRM deal model, planned for Phase 3.',
  document: 'Document storage isn’t set up yet. Your administrator connects it.',
};

const formSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(300, 'Keep it under 300 characters'),
  related: z.string().trim().max(200),
  extra: z.string(),
  notes: z.string().trim().max(1000, 'Keep notes under 1,000 characters'),
});
type FormValues = z.infer<typeof formSchema>;

export function QuickCreateModal() {
  const create = useUiStore((state) => state.create);
  const close = useUiStore((state) => state.closeCreate);
  const viewer = useViewer();
  const definition = create ? CREATE_DEFINITIONS[create.type] : null;
  // Real uploads whenever document storage is configured, in either data mode: documents are RedSky's own data.
  const realUpload = create?.type === 'document' && viewer.config.documentsAvailable;
  return (
    <Modal open={Boolean(create)} onOpenChange={(open) => !open && close()} label={definition?.title ?? 'Create'} hiddenLabel={false} zIndex={67} wrapStyle={{ paddingTop: '14vh' }} style={{ width: 'min(540px,100%)' }}>
      {create && realUpload ? <DocumentUploadForm onClose={close} /> : null}
      {create && !realUpload ? <CreateForm key={create.type} type={create.type} prefill={create.prefill} onClose={close} /> : null}
    </Modal>
  );
}

function CreateForm({ type, prefill, onClose }: { type: CreateType; prefill: CreatePrefill; onClose: () => void }) {
  const viewer = useViewer();
  const definition = CREATE_DEFINITIONS[type];
  const demo = viewer.config.dataMode === 'demo';
  const unavailable = !definition.native && !demo ? UNAVAILABLE_NOTE[type] : undefined;
  const { toast, askAi } = useUiStore.getState();
  const { refreshWidgets } = useWorkspaceActions();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, control, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: prefill.title, related: prefill.related, extra: prefill.extra || definition.extraOptions[0] || '', notes: prefill.notes },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      if (type === 'task') {
        await apiFetch('/api/tasks', { method: 'POST', body: { title: values.title, related: values.related || undefined, due: values.extra, notes: values.notes || undefined } });
        await refreshWidgets();
        toast('Task added to My Tasks');
      } else if (type === 'research') {
        onClose();
        void askAi(`Start research on ${values.title}`, demo ? { key: /halcyon/i.test(values.title) ? 'company' : 'research', ref: values.title } : {});
        return;
      } else {
        const result = await apiFetch<{ message: string }>('/api/quick-create', { method: 'POST', body: { type, title: values.title, related: values.related || undefined, extra: values.extra } });
        toast(result.message);
      }
      onClose();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 14px 18px', borderBottom: '1px solid var(--bd)' }}>
        <Tile icon={definition.icon} small />
        <DialogTitle className="grow" style={{ fontSize: 15, fontWeight: 600 }}>
          {definition.title}
        </DialogTitle>
        <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close" onClick={onClose}>
          <Icon name="x" size="s" />
        </button>
      </header>
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {type === 'document' && demo ? (
          <label className="muted" style={{ border: '1.5px dashed var(--bd2)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', position: 'relative', textAlign: 'center' }}>
            <Icon name="upload" size="l" />
            <span style={{ fontWeight: 500, color: 'var(--tx)' }}>Choose a file</span>
            <span style={{ fontSize: 12 }}>Stays on your device in this demo</span>
            <input
              type="file"
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setValue('title', file.name, { shouldValidate: true });
              }}
            />
          </label>
        ) : null}
        <div className="field">
          <label htmlFor="c-title">{definition.fieldLabel}</label>
          <input id="c-title" className="input" autoFocus placeholder={definition.placeholder} aria-invalid={Boolean(formState.errors.title)} {...register('title')} />
          {formState.errors.title ? <span className="field-err">{formState.errors.title.message}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="c-rel">{definition.relLabel}</label>
          {demo ? (
            <select id="c-rel" className="input" {...register('related')}>
              <option value="">None</option>
              {DEMO_RELATED.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input id="c-rel" className="input" placeholder="Optional" {...register('related')} />
          )}
        </div>
        <div className="field">
          <span className="flabel" id="c-extra-l">
            {definition.extraLabel}
          </span>
          <Controller
            control={control}
            name="extra"
            render={({ field }) => <Segmented label={definition.extraLabel} options={definition.extraOptions.map((option) => ({ value: option, label: option }))} value={field.value} onChange={field.onChange} style={{ alignSelf: 'flex-start' }} />}
          />
        </div>
        <div className="field">
          <label htmlFor="c-notes">Notes</label>
          <textarea id="c-notes" className="input" rows={3} placeholder="Optional context for colleagues" {...register('notes')} />
          {formState.errors.notes ? <span className="field-err">{formState.errors.notes.message}</span> : null}
        </div>
        {unavailable ? (
          <div className="note note-wn" role="status">
            <Icon name="alert" size="s" style={{ marginTop: 1, color: 'var(--wn)' }} />
            <span>{unavailable}</span>
          </div>
        ) : (
          <div className="note" style={{ fontSize: 12 }}>
            <Icon name="shield" size="s" style={{ marginTop: 1 }} />
            <span>{definition.note}</span>
          </div>
        )}
        {serverError ? (
          <p role="alert" className="field-err">
            {serverError}
          </p>
        ) : null}
      </div>
      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--bd)', background: 'var(--bg)' }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-p" disabled={Boolean(unavailable) || formState.isSubmitting}>
          {formState.isSubmitting ? <Icon name="refresh" size="s" className="spin" /> : null}
          {definition.saveLabel}
        </button>
      </footer>
    </form>
  );
}
