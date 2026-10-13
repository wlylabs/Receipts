'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface Stat {
  k: string;
  v: string;
  tone?: 'pos' | 'neg' | null;
}

/**
 * The end of a run, printed as a till receipt: who and what at the top, the numbers that made it
 * line by line, the P&L as the total, and the rank stamped across the foot. While the replay is
 * still running it prints only the header and a running total.
 */
export function ResultCard({
  kicker,
  sub,
  pnl,
  roi,
  tone,
  rank,
  stats,
  printing = false,
  children,
}: {
  kicker: string;
  /** A second header line, e.g. the token and chain. */
  sub?: string;
  pnl: string;
  roi: string | null;
  tone: 'pos' | 'neg' | null;
  rank: { name: string; line: string };
  stats: Stat[];
  /** The replay is still running: no lines and no stamp yet. */
  printing?: boolean;
  children?: ReactNode;
}) {
  const color = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink';
  return (
    <div className="receipt-shadow">
      <div className="receipt px-5 pt-5 text-[12.5px] sm:px-6">
        <div className="text-center">
          <p className="text-[13px] font-bold tracking-[0.22em]">RECEIPT</p>
          <p className="mt-1 truncate text-[11px] text-muted">{kicker}</p>
          {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
        </div>
        <hr className="rule my-4" />

        {printing ? (
          <div className="space-y-2 py-1" aria-hidden>
            {[78, 64, 86, 52].map((w, i) => (
              <div key={i} className="skeleton h-3" style={{ width: `${w}%` }} />
            ))}
            <p className="pt-1 text-center text-[11px] text-muted">PRINTING…</p>
          </div>
        ) : (
          <dl className="space-y-1">
            {stats.map((s, i) => (
              <div key={s.k} className="rise flex items-baseline justify-between gap-3" style={{ animationDelay: `${i * 45}ms` }}>
                <dt className="truncate text-muted">{s.k.toUpperCase()}</dt>
                <dd className={cx('num shrink-0 text-right font-medium', s.tone === 'pos' && 'text-pos', s.tone === 'neg' && 'text-neg')}>{s.v}</dd>
              </div>
            ))}
          </dl>
        )}

        <hr className="rule my-4" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-bold">TOTAL P&amp;L</span>
          {roi && !printing && <span className={cx('num text-[12px] font-semibold', color)}>{roi}</span>}
        </div>
        <p className={cx('num mt-1 text-right font-sans text-[38px] font-bold leading-none tracking-[-0.04em] sm:text-[44px]', color)}>{pnl}</p>

        {!printing && (
          <>
            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="min-w-0 text-[11px] leading-snug text-muted">{rank.line}</p>
              <span className={cx('stamp stamp-in shrink-0 text-[17px]', color)} style={{ '--d': `${stats.length * 45 + 120}ms` } as CSSProperties}>
                {rank.name.toUpperCase()}
              </span>
            </div>
            <hr className="rule my-4" />
            {children}
          </>
        )}
      </div>
    </div>
  );
}
