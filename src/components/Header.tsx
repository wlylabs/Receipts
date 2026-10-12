import Link from 'next/link';
import { Logo } from './Logo';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-1.5 rounded-md text-ink" aria-label="receipts, home">
          <Logo className="size-[22px]" />
          <span className="text-[17px] font-semibold tracking-[-0.035em]">receipts</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-0.5 text-[13.5px] font-medium">
          <Link href="/#paste" className="rounded-lg px-3 py-2 text-muted transition-colors hover:bg-hover hover:text-ink">
            Paste
          </Link>
          <Link href="/#book" className="rounded-lg px-3 py-2 text-muted transition-colors hover:bg-hover hover:text-ink">
            My trades
          </Link>
        </nav>
      </div>
    </header>
  );
}
