'use client';

import { Icon } from '@/components/ui/icon';
import { useUiStore } from '@/lib/client/ui-store';

// Bottom-center toast (~4.2 s) with optional Undo (SPEC §6.6).
export function ToastViewport() {
  const toast = useUiStore((state) => state.toastState);
  const dismiss = useUiStore((state) => state.dismissToast);
  if (!toast) return null;
  return (
    <div className="twrap">
      <div className="toast a-in" role="status" key={toast.id}>
        <Icon name="check" size="s" style={{ color: '#7FB892' }} />
        <span>{toast.message}</span>
        {toast.undo ? (
          <button
            type="button"
            className="link"
            style={{ color: '#ECDCB9', marginLeft: 4 }}
            onClick={() => {
              toast.undo?.();
              dismiss();
            }}
          >
            Undo
          </button>
        ) : null}
      </div>
    </div>
  );
}
