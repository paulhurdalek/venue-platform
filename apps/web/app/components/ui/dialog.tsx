'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

export function Dialog({
  open,
  title,
  eyebrow,
  onClose,
  children,
  size = 'default',
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'default' | 'wide';
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-label={title}
      className={`app-dialog${size === 'wide' ? ' app-dialog--wide' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialogRef}
    >
      <div className="app-dialog__surface">
        <header className="app-dialog__header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
          </div>
          <button
            aria-label={`${title} schließen`}
            className="dialog-close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="app-dialog__body">{children}</div>
      </div>
    </dialog>
  );
}
