'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** A bottom sheet on phones, a centred dialog on wider screens. */
export function Sheet({ open, onClose, title, wide = false, children }: { open: boolean; onClose: () => void; title: string; wide?: boolean; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // a field inside that asked for focus keeps it
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  // in <body>, so no transformed ancestor can trap the fixed overlay
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="fade-in absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`sheet-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-bg outline-none sm:rounded-2xl ${wide ? 'sm:max-w-[680px]' : 'sm:max-w-[460px]'}`}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <p className="absolute left-4 text-[14px] font-semibold">{title}</p>
          <button type="button" onClick={onClose} className="absolute right-2 grid size-9 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
