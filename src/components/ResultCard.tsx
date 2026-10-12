'use client';

import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface Stat {
  k: string;
  v: string;
  tone?: 'pos' | 'neg' | null;
}

/** The end of a run: the P&L big, the rank under it, the numbers that made it. */
export function ResultCard({
  kicker,
  pnl,
  roi,
  tone,
  rank,
  stats,
  children,
}: {
  kicker: string;
  pnl: string;
  roi: string | null;
  tone: 'pos' | 'neg' | null;
  rank: { name: string; line: string };
  stats: Stat[];
  children?: ReactNode;
}) {
  return (
    <div className="rise">
      <p className="eyebrow">{kicker}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className={cx('num text-[34px] font-semibold leading-none tracking-[-0.03em] sm:text-[40px]', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{pnl}</p>
        {roi && <span className={cx('num rounded-md px-2 py-0.5 text-[13px] font-semibold', tone === 'pos' ? 'bg-pos-wash text-pos' : tone === 'neg' ? 'bg-neg-wash text-neg' : 'bg-subtle text-muted')}>{roi}</span>}
      </div>
      <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-subtle px-3 py-2.5">
        <span className="rounded-md bg-ink px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-ink">{rank.name}</span>
        <span className="text-[13px] leading-snug text-ink-2">{rank.line}</span>
      </div>
      {/* two columns on phones too: half the rows to scroll past */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        {stats.map((s) => (
          <div key={s.k} className="min-w-0 border-b border-line pb-1.5 sm:flex sm:justify-between sm:gap-2">
            <dt className="truncate text-[12px] text-muted sm:text-[13px]">{s.k}</dt>
            <dd className={cx('num truncate font-medium sm:text-right', s.tone === 'pos' && 'text-pos', s.tone === 'neg' && 'text-neg')}>{s.v}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
