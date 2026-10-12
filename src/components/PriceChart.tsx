'use client';

import { useId, useMemo } from 'react';
import { cx } from '../lib/cx';

export interface Marker {
  ts: number;
  price: number;
  kind: 'buy' | 'sell' | 'entry' | 'exit';
  label?: string;
}

const VW = 1000;
const VH = 400;

/**
 * A token's price since launch on a log scale (memecoins move in multiples). The line is drawn
 * in SVG stretched to the box; markers are HTML on top so they stay round at any width.
 */
export function PriceChart({
  series,
  markers = [],
  range,
  reveal,
  tone,
  athTs,
  className,
}: {
  series: readonly [number, number][];
  markers?: Marker[];
  /** Indexes of a held stretch to draw over the line. */
  range?: [number, number];
  /** Index the held stretch is drawn up to, for the replay. */
  reveal?: number;
  tone?: 'pos' | 'neg' | null;
  athTs?: number;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const geo = useMemo(() => {
    if (series.length < 2) return null;
    const t0 = series[0]![0];
    const t1 = series.at(-1)![0];
    let lo = Infinity;
    let hi = 0;
    for (const [, p] of series) {
      if (p > 0) {
        lo = Math.min(lo, p);
        hi = Math.max(hi, p);
      }
    }
    for (const m of markers) {
      if (m.price > 0) {
        lo = Math.min(lo, m.price);
        hi = Math.max(hi, m.price);
      }
    }
    const llo = Math.log(lo);
    const lhi = Math.log(hi === lo ? hi * 1.1 : hi);
    const x = (ts: number) => ((ts - t0) / Math.max(1, t1 - t0)) * VW;
    const y = (p: number) => VH - 16 - ((Math.log(Math.max(p, lo)) - llo) / Math.max(1e-9, lhi - llo)) * (VH - 40);
    const path = (from: number, to: number) =>
      series
        .slice(from, to + 1)
        .map(([ts, p], i) => `${i ? 'L' : 'M'}${x(ts).toFixed(1)},${y(p).toFixed(1)}`)
        .join('');
    return { x, y, path };
  }, [series, markers]);

  if (!geo) return <div className={cx('grid aspect-[5/2] place-items-center rounded-xl bg-surface-2 text-sm text-muted', className)}>Not enough trades for a chart yet.</div>;

  const line = geo.path(0, series.length - 1);
  const area = `${line}L${VW},${VH}L0,${VH}Z`;
  const held = range ? geo.path(range[0], Math.min(range[1], reveal ?? range[1])) : null;
  const heldColor = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--ink)';
  const ath = athTs !== undefined ? series.find(([ts]) => ts === athTs) : undefined;

  return (
    <div className={cx('relative aspect-[5/2] w-full select-none', className)}>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--ink)" stopOpacity="0.12" />
            <stop offset="1" stopColor="var(--ink)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={VW} y1={VH * f} y2={VH * f} stroke="var(--line)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#g${gid})`} />
        <path d={line} fill="none" stroke={range ? 'var(--muted)' : 'var(--ink)'} strokeOpacity={range ? 0.55 : 1} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {held && <path d={held} fill="none" stroke={heldColor} strokeWidth="3.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
      {ath && (
        <span className="label absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[9.5px] text-bg" style={{ left: `${(geo.x(ath[0]) / VW) * 100}%`, top: `${(geo.y(ath[1]) / VH) * 100 - 2}%` }}>
          ATH
        </span>
      )}
      {markers.map((m, i) => (
        <span
          key={i}
          title={m.label}
          className={cx(
            'absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[var(--surface)] font-mono font-bold leading-none shadow',
            m.kind === 'entry' || m.kind === 'exit' ? 'size-6 text-[10px]' : 'size-4 text-[8px]',
            m.kind === 'buy' || m.kind === 'entry' ? 'bg-pos text-white' : 'bg-neg text-white',
            m.kind === 'entry' && 'bg-hi text-hi-ink',
            m.kind === 'exit' && 'bg-ink text-bg',
          )}
          style={{ left: `${(geo.x(m.ts) / VW) * 100}%`, top: `${(geo.y(m.price) / VH) * 100}%` }}
        >
          {m.kind === 'buy' ? 'B' : m.kind === 'sell' ? 'S' : m.kind === 'entry' ? 'IN' : 'OUT'}
        </span>
      ))}
    </div>
  );
}
