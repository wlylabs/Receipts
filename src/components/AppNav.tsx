'use client';

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, House, Search } from 'lucide-react';
import { cx } from '../lib/cx';
import { Logo } from './Logo';
import { Omnibox } from './Omnibox';
import { RecentList } from './RecentList';
import { Sheet } from './Sheet';

type Item = { href: string; label: string; icon: ComponentType<{ className?: string }> };

const HOME: Item = { href: '/', label: 'Home', icon: House };
const RECENT: Item = { href: '/recent', label: 'Recent', icon: Clock };
const ITEMS = [HOME, RECENT];

/**
 * The app's chrome: a sidebar on wide screens, a top bar and a bottom tab bar on phones, and one
 * search sheet both open (also on "/" or ⌘K).
 */
export function AppNav() {
  const pathname = usePathname();
  const [searching, setSearching] = useState(false);
  const open = useCallback(() => setSearching(true), []);
  const close = useCallback(() => setSearching(false), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearching(true);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      {/* sidebar, wide screens */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-subtle lg:flex">
        <div className="flex h-14 items-center px-5">
          <Brand />
        </div>
        <nav aria-label="Main" className="mt-2 space-y-0.5 px-3">
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active(it.href) ? 'page' : undefined}
              className={cx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
                active(it.href) ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-muted hover:bg-hover hover:text-ink',
              )}
            >
              <it.icon className="size-4" />
              {it.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto pb-4">
          <p className="eyebrow px-6 pb-1.5">Recently opened</p>
          <div className="px-3">
            <RecentList limit={6} compact />
          </div>
        </div>
        <p className="border-t border-line px-6 py-4 text-[12px] leading-relaxed text-muted">Paper money only. Not financial advice.</p>
      </aside>

      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden w-full max-w-md lg:block">
            <SearchButton onClick={open} />
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={open} className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink lg:hidden" aria-label="Search">
              <Search className="size-[18px]" />
            </button>
            <nav aria-label="Main" className="hidden items-center gap-0.5 sm:flex lg:hidden">
              {ITEMS.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active(it.href) ? 'page' : undefined}
                  className={cx('rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors', active(it.href) ? 'text-ink' : 'text-muted hover:bg-hover hover:text-ink')}
                >
                  {it.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* tab bar, phones */}
      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg sm:hidden"
      >
        <div className="grid h-16 grid-cols-3">
          <Tab item={HOME} active={active(HOME.href)} />
          <button type="button" onClick={open} className={cx('flex flex-col items-center justify-center gap-1 text-[11px] font-medium', searching ? 'text-ink' : 'text-muted')}>
            <Search className="size-5" aria-hidden />
            Search
          </button>
          <Tab item={RECENT} active={active(RECENT.href)} />
        </div>
      </nav>

      <Sheet open={searching} onClose={close} title="Search">
        {/* no autofocus: on a phone it would throw the keyboard up over the sheet */}
        <Omnibox size="sm" onGo={close} />
        <p className="eyebrow mb-1.5 mt-5">Recently opened</p>
        <div className="-mx-3">
          <RecentList limit={5} compact onPick={close} />
        </div>
      </Sheet>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-1.5 rounded-md text-ink" aria-label="receipts, home">
      <Logo className="size-[22px]" />
      <span className="text-[17px] font-semibold tracking-[-0.035em]">receipts</span>
    </Link>
  );
}

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="field h-9 w-full justify-between px-3 text-left text-[13px] text-faint hover:border-line-strong"
    >
      <span className="flex items-center gap-2">
        <Search className="size-4" aria-hidden />
        Token CA or wallet…
      </span>
      <kbd className="rounded border border-line bg-surface px-1.5 font-sans text-[11px] text-muted">/</kbd>
    </button>
  );
}

function Tab({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cx('flex flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-ink' : 'text-muted')}
    >
      <item.icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );
}
