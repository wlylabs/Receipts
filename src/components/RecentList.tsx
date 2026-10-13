'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useStored } from '../hooks/useStored';
import { KEYS, type Recent } from '../lib/game';
import { ROUTES } from '../lib/site';
import { cx } from '../lib/cx';

export const hrefOf = (r: Recent) => (r.kind === 'token' ? ROUTES.token(r.address) : r.kind === 'trader' && r.ca ? ROUTES.trader(r.address, r.ca) : ROUTES.wallet(r.address));

const KINDS = { token: 'Token', wallet: 'Wallet', trader: 'Replay' };

/** What this browser looked up last, newest first: a short menu list, or a grid of stubs. */
export function RecentList({ limit, compact = false, onPick, hideEmpty = false, title }: { limit?: number; compact?: boolean; onPick?: () => void; hideEmpty?: boolean; title?: string }) {
  const [recent] = useStored<Recent[]>(KEYS.recent, []);
  const list = limit ? recent.slice(0, limit) : recent;

  if (!list.length) {
    if (hideEmpty) return null;
    return <p className="px-2 py-2 text-[12.5px] text-muted">Nothing yet. Paste an address to start.</p>;
  }
  if (compact)
    return (
      <ul className="space-y-0.5">
        {list.map((r) => (
          <li key={`${r.kind}:${r.address}:${r.ca ?? ''}`}>
            <Link href={hrefOf(r)} onClick={onPick} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink">
              <span className="label w-12 shrink-0 text-[9.5px]">{KINDS[r.kind]}</span>
              <span className="mono min-w-0 flex-1 truncate text-[12.5px]">{r.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  return (
    <div>
      {title && <h2 className="label mb-3">{title}</h2>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map((r) => (
          <li key={`${r.kind}:${r.address}:${r.ca ?? ''}`}>
            <Link
              href={hrefOf(r)}
              onClick={onPick}
              className="group flex items-center gap-3 rounded-[10px] border border-dashed border-line-strong bg-surface/60 px-3.5 py-3 transition-colors hover:border-solid hover:border-ink hover:bg-surface"
            >
              <span className={cx('chip shrink-0', r.kind === 'trader' && 'border-ink bg-accent text-on-accent')}>{KINDS[r.kind]}</span>
              <span className="mono min-w-0 flex-1 truncate text-[13px] text-ink">{r.label}</span>
              <ArrowUpRight className="size-4 shrink-0 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
