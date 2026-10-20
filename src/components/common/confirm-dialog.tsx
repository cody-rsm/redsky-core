'use client';

import { useRef, useState } from 'react';
import { Modal, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { errorMessage } from '@/lib/client/api';
import { useUiStore } from '@/lib/client/ui-store';

// The single confirmation step every record-changing, AI-proposed or sharing action goes through (SPEC §1).
export function ConfirmDialog() {
  const request = useUiStore((state) => state.confirm);
  const close = useUiStore((state) => state.closeConfirm);
  const toast = useUiStore((state) => state.toast);
  const okRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!request || busy) return;
    setBusy(true);
    try {
      await request.run();
      close();
    } catch (error) {
      toast(errorMessage(error));
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(request)}
      onOpenChange={(open) => !open && close()}
      label={request?.title ?? 'Confirm'}
      hiddenLabel={false}
      role="alertdialog"
      zIndex={85}
      wrapStyle={{ paddingTop: '18vh' }}
      style={{ width: 'min(480px,100%)' }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        okRef.current?.focus();
      }}
    >
      {request ? (
        <>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span className="tile" style={{ background: 'var(--acs)', color: 'var(--act)', borderColor: 'transparent' }}>
                <Icon name="shield" />
              </span>
              <div>
                <DialogTitle style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 4 }}>{request.title}</DialogTitle>
                <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                  {request.body}
                </p>
              </div>
            </div>
            {request.items.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--bd)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg)' }}>
                {request.items.map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45 }}>
                    <Icon name="plus" size="s" style={{ color: 'var(--act)', marginTop: 2 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="faint" style={{ fontSize: 11.5, display: 'flex', gap: 6, alignItems: 'center' }}>
              <Icon name="lock" size="xs" />
              Requires your confirmation · recorded in the audit log
            </div>
          </div>
          <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--bd)', background: 'var(--bg)' }}>
            <button type="button" className="btn" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button ref={okRef} type="button" className="btn btn-p" onClick={confirm} disabled={busy}>
              {busy ? <Icon name="refresh" size="s" className="spin" /> : null}
              {request.ok}
            </button>
          </footer>
        </>
      ) : null}
    </Modal>
  );
}
