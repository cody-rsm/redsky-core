'use client';

import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

// shadcn-style dialog primitives on Radix (focus trap, focus return, aria-modal, layered Esc), styled with the
// prototype's .backdrop / .mwrap / .modal / .drawer classes and z-index ladder.

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Accessible name; rendered visually hidden unless the content provides its own <DialogTitle>.
  label: string;
  hiddenLabel?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  zIndex?: number;
  role?: 'dialog' | 'alertdialog';
  onOpenAutoFocus?: (event: Event) => void;
};

function A11yTitle({ label, hidden }: { label: string; hidden: boolean }) {
  return hidden ? (
    <VisuallyHidden.Root asChild>
      <RadixDialog.Title>{label}</RadixDialog.Title>
    </VisuallyHidden.Root>
  ) : null;
}

export function Modal({ open, onOpenChange, label, hiddenLabel = true, children, className, style, zIndex = 70, role = 'dialog', onOpenAutoFocus, wrapStyle }: BaseProps & { wrapStyle?: CSSProperties }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="backdrop" style={{ zIndex: zIndex - 2 }} />
        <div className="mwrap" style={{ zIndex, ...wrapStyle }}>
          <RadixDialog.Content className={cn('modal a-pop', className)} style={style} role={role} aria-describedby={undefined} onOpenAutoFocus={onOpenAutoFocus}>
            <A11yTitle label={label} hidden={hiddenLabel} />
            {children}
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function Drawer({ open, onOpenChange, label, hiddenLabel = true, children, className, style, zIndex = 60, onOpenAutoFocus, wide }: BaseProps & { wide?: boolean }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="backdrop" style={{ zIndex: zIndex - 5 }} />
        <RadixDialog.Content className={cn('drawer a-slide', wide && 'drawer-w', className)} style={{ zIndex, ...style }} aria-describedby={undefined} onOpenAutoFocus={onOpenAutoFocus}>
          <A11yTitle label={label} hidden={hiddenLabel} />
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogTitle = RadixDialog.Title;
export const DialogClose = RadixDialog.Close;
