'use client';

import { useState, type FormEvent } from 'react';
import { DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Tile } from '@/components/ui/tile';
import { addNoteSchema } from '@/features/crm/schema';
import { errorMessage } from '@/lib/client/api';
import { useCrmWrites, type NoteTarget } from '@/lib/client/crm';
import { useUiStore } from '@/lib/client/ui-store';

type AddNoteFormProps = { target: NoteTarget; onClose: () => void };

// Adds a note to a CRM contact or company as the signed-in employee.
export function AddNoteForm({ target, onClose }: AddNoteFormProps) {
  const { addNote } = useCrmWrites();
  const toast = useUiStore((state) => state.toast);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const parsed = addNoteSchema.safeParse({ requestKey, target: { kind: target.kind, id: target.id }, title, body });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Check the note');
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const result = await addNote(target, { title: parsed.data.title, body: parsed.data.body }, requestKey);
      toast(result.message);
      onClose();
    } catch (error) {
      setProblem(errorMessage(error));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 14px 18px', borderBottom: '1px solid var(--bd)' }}>
        <Tile icon="edit" small />
        <DialogTitle className="grow" style={{ fontSize: 15, fontWeight: 600 }}>
          Add note · {target.label}
        </DialogTitle>
        <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close" onClick={onClose}>
          <Icon name="x" size="s" />
        </button>
      </header>
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="note-title">Title</label>
          <input id="note-title" className="input" placeholder="Optional" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="note-body">Note</label>
          <textarea id="note-body" className="input" rows={6} autoFocus value={body} onChange={(event) => setBody(event.target.value)} />
        </div>
        <div className="note" style={{ fontSize: 12 }}>
          <Icon name="shield" size="s" style={{ marginTop: 1 }} />
          <span>Saved to the RSM CRM as you. Anyone whose CRM role can see this {target.kind === 'company' ? 'organization' : 'contact'} can read it.</span>
        </div>
        {problem ? (
          <p role="alert" className="field-err">
            {problem}
          </p>
        ) : null}
      </div>
      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--bd)', background: 'var(--bg)' }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-p" disabled={saving || !body.trim()}>
          {saving ? <Icon name="refresh" size="s" className="spin" /> : null}
          Add note
        </button>
      </footer>
    </form>
  );
}
