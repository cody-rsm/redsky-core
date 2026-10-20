'use client';

import { useState, type DragEvent, type FormEvent } from 'react';
import { DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Tile } from '@/components/ui/tile';
import { DOCUMENT_ACCEPT, DOCUMENT_VISIBILITY_OPTIONS, formatBytes, validateDocumentFile, type DocumentVisibility } from '@/features/documents/catalog';
import type { DocumentRow } from '@/lib/api/contracts';
import { errorMessage } from '@/lib/client/api';
import { useDocumentActions } from '@/lib/client/documents';
import { useUiStore } from '@/lib/client/ui-store';

type DocumentUploadFormProps = { onClose: () => void; onUploaded?: (document: DocumentRow) => void };

// Upload to RedSky's document storage, used by the Documents page and by + New › Upload document.
export function DocumentUploadForm({ onClose, onUploaded }: DocumentUploadFormProps) {
  const { upload } = useDocumentActions();
  const toast = useUiStore((state) => state.toast);
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<DocumentVisibility>('private');
  const [related, setRelated] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  function choose(candidate: File | undefined) {
    if (!candidate) return;
    const issue = validateDocumentFile(candidate);
    setProblem(issue);
    setFile(issue ? null : candidate);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    if (!busy) choose(event.dataTransfer.files[0]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const document = await upload(file, { visibility, related: related.trim() });
      toast(document.noAi ? 'Uploaded. It’s marked _NOAI, so RedSky won’t read it.' : 'Uploaded. RedSky is reading it now.');
      onUploaded?.(document);
      onClose();
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const hint = DOCUMENT_VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.hint;
  return (
    <form onSubmit={onSubmit} noValidate>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 14px 18px', borderBottom: '1px solid var(--bd)' }}>
        <Tile icon="upload" small />
        <DialogTitle className="grow" style={{ fontSize: 15, fontWeight: 600 }}>
          Upload document
        </DialogTitle>
        <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close" onClick={onClose}>
          <Icon name="x" size="s" />
        </button>
      </header>
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label
          className="drop drop-sm"
          data-on={dragOver}
          data-disabled={busy}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept={DOCUMENT_ACCEPT}
            disabled={busy}
            aria-label="Choose a file to upload"
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <Icon name={file ? 'doc' : 'upload'} size="l" />
          {file ? (
            <>
              <span style={{ fontWeight: 600, color: 'var(--tx)', overflowWrap: 'anywhere' }}>{file.name}</span>
              <span className="faint" style={{ fontSize: 12 }}>
                {formatBytes(file.size)} · choose another file to replace it
              </span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 600, color: 'var(--tx)' }}>Drop a file or choose one</span>
              <span className="faint" style={{ fontSize: 12 }}>
                PDF, Word, PowerPoint, Excel, PNG, JPEG or TIFF · up to 50 MB
              </span>
            </>
          )}
        </label>
        <div className="field">
          <span className="flabel">Visibility</span>
          <Segmented label="Visibility" options={DOCUMENT_VISIBILITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} value={visibility} onChange={setVisibility} style={{ alignSelf: 'flex-start' }} />
          <span className="faint" style={{ fontSize: 11.5 }}>
            {hint}
          </span>
        </div>
        <div className="field">
          <label htmlFor="doc-related">Link to</label>
          <input id="doc-related" className="input" placeholder="Optional, e.g. Halcyon Robotics · Series B" maxLength={200} value={related} onChange={(event) => setRelated(event.target.value)} />
        </div>
        <div className="note" style={{ fontSize: 12 }}>
          <Icon name="shield" size="s" style={{ marginTop: 1 }} />
          <span>Stored in RSM’s own storage and read by RedSky’s private text reader. Nothing goes to an outside service. Files tagged _NOAI are stored but never read.</span>
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
        <button type="submit" className="btn btn-p" disabled={!file || busy}>
          {busy ? <Icon name="refresh" size="s" className="spin" /> : null}
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </footer>
    </form>
  );
}
