'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { Logo } from './Logo';
import { Omnibox } from './Omnibox';
import { RecentList } from './RecentList';
import { ThemeToggle } from './ThemeToggle';
import { cx } from '../lib/cx';

/** The bar over every result: home, the paste box for the next address, and what was looked up last. */
export function AppBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Wordmark />
        <div className="min-w-0 flex-1 sm:max-w-md md:mx-auto">
          <Omnibox size="sm" />
        </div>
        <div className="flex shrink-0 items-center">
          <ThemeToggle />
          <RecentMenu />
        </div>
      </div>
    </header>
  );
}

export function Wordmark({ className, full = false }: { className?: string; full?: boolean }) {
  return (
    <Link href="/" className={cx('flex h-10 shrink-0 items-center gap-2 rounded-md text-ink', className)} aria-label="Receipts, home">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent ring-1 ring-[var(--key)]">
        <Logo className="size-[18px]" />
      </span>
      <span className={cx('text-[17px] font-bold tracking-[-0.04em]', !full && 'hidden sm:inline')}>receipts</span>
    </Link>
  );
}

function RecentMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', away);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', away);
    };
  }, [open]);
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn btn-ghost h-10 min-h-0 px-2.5 text-[13px]" aria-label="Recent">
        <History className="size-4" aria-hidden />
        <span className="hidden md:inline">Recent</span>
      </button>
      {open && (
        <div className="panel fade-in absolute right-0 top-full z-40 mt-2 w-72 p-2">
          <p className="label px-2 pb-1.5 pt-1">Recent</p>
          <RecentList limit={8} compact onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
