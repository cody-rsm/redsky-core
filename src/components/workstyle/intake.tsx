'use client';

import { useState, type DragEvent } from 'react';
import { Icon } from '@/components/ui/icon';
import { WS_CONSENT_TEXT, WS_MAX_UPLOAD_BYTES } from '@/features/workstyle/catalog';
import { useUiStore } from '@/lib/client/ui-store';

type ConsentCheckboxProps = { checked: boolean; onChange: (checked: boolean) => void; compact?: boolean };

export function ConsentCheckbox({ checked, onChange, compact }: ConsentCheckboxProps) {
  return (
    <button type="button" className="consent" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="cbox">
        <Icon name="check" size="xs" strokeWidth={2.6} />
      </span>
      {compact ? (
        <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600, display: 'block' }}>{WS_CONSENT_TEXT.title}</span>
          <span className="muted">{WS_CONSENT_TEXT.shortBody}</span>
        </span>
      ) : (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>{WS_CONSENT_TEXT.title}</span>
          <span className="muted">{WS_CONSENT_TEXT.body}</span>
        </span>
      )}
    </button>
  );
}

// Client-side checks mirror the server's (which remain authoritative) so the employee hears back immediately.
export function validateReportFile(file: File): string | null {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return 'Please upload your report as a PDF';
  if (file.size === 0) return 'The file is empty';
  if (file.size > WS_MAX_UPLOAD_BYTES) return 'Reports can be up to 10 MB';
  return null;
}

type ReportDropProps = { consent: boolean; onFile: (file: File) => void; small?: boolean; disabled?: boolean };

export function ReportDrop({ consent, onFile, small, disabled }: ReportDropProps) {
  const [dragOver, setDragOver] = useState(false);
  const toast = useUiStore((state) => state.toast);
  const blocked = !consent || Boolean(disabled);

  const accept = (file: File | undefined) => {
    if (!file) return;
    if (!consent) {
      toast('Please confirm consent before uploading');
      return;
    }
    const problem = validateReportFile(file);
    if (problem) {
      toast(problem);
      return;
    }
    onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (!blocked) accept(event.dataTransfer.files[0]);
  };

  const hint = consent ? 'Your report stays private to you' : 'Confirm consent above to enable upload';
  return (
    <label
      className={small ? 'drop drop-sm' : 'drop'}
      data-on={dragOver}
      data-disabled={blocked}
      onDragOver={(event) => {
        event.preventDefault();
        if (!blocked) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={blocked}
        aria-label="Upload your TTI Talent Insights report (PDF)"
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
        onChange={(event) => {
          accept(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <span className="drop-ic">
        <Icon name="upload" size="l" />
      </span>
      {small ? (
        <>
          <span style={{ fontWeight: 600 }}>Drop your TTI Talent Insights PDF</span>
          <span className="faint" style={{ fontSize: 12 }}>
            {hint}
          </span>
        </>
      ) : (
        <>
          <span className="serif" style={{ fontSize: 22, lineHeight: 1.2 }}>
            Drop your TTI Talent Insights report
          </span>
          <span className="muted" style={{ fontSize: 13 }}>
            or <span style={{ color: 'var(--act)', fontWeight: 500 }}>browse your files</span> · PDF up to 10 MB
          </span>
          <span className="faint" style={{ fontSize: 11.5, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
            <Icon name="lock" size="xs" />
            {hint}
          </span>
        </>
      )}
    </label>
  );
}

// The upload is one request, so progress is shown as what is happening — never as a fabricated percentage.
const PROCESSING_STEPS = ['Uploading over an encrypted connection', 'Reading the report text', 'Looking for DISC and Driving Forces scores'];

export function ProcessingCard({ fileName, compact }: { fileName: string; compact?: boolean }) {
  return (
    <div className="card" style={{ padding: compact ? '16px 18px' : '18px 20px', display: 'flex', flexDirection: 'column', gap: compact ? 10 : 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="tile tile-s">
          <Icon name="doc" size="s" />
        </span>
        <span className="grow ell" style={{ fontWeight: 500 }}>
          {compact ? `Reading ${fileName}` : fileName}
        </span>
      </div>
      <span className="bar bar-ind" style={{ height: 4 }} aria-hidden="true">
        <span />
      </span>
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 9, marginTop: compact ? 0 : 4 }}>
        {PROCESSING_STEPS.map((label, index) => (
          <div key={label} className="xrow" data-s={index === 0 ? 'active' : 'wait'}>
            <span className="xs">
              <Icon name="check" size="xs" strokeWidth={2.8} />
            </span>
            <span>{label}</span>
          </div>
        ))}
        <div className="xrow" data-s="wait">
          <span className="xs">
            <Icon name="check" size="xs" strokeWidth={2.8} />
          </span>
          <span>You review every value before RedSky uses it</span>
        </div>
      </div>
    </div>
  );
}
