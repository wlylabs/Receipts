import Link from 'next/link';
import { Logo } from './Logo';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md">
          <Logo className="size-8" />
          <span className="text-lg font-bold tracking-tight">Receipts</span>
          <span className="label hidden rounded-full border border-line px-2 py-0.5 text-muted sm:inline">any DEX token</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-semibold">
          <Link href="/#paste" className="rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink">
            Paste
          </Link>
          <Link href="/#how" className="hidden rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink sm:block">
            How it plays
          </Link>
        </nav>
      </div>
    </header>
  );
}
