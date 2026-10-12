'use client';

import { useId, useMemo } from 'react';
import { cx } from '../lib/cx';

export interface Marker {
  ts: number;
  price: number;
  kind: 'buy' | 'sell';
  /** Short text on the marker; B or S when left out. */
  label?: string;
}

const VW = 1000;
const VH = 420;
const PAD_TOP = 26;
const PAD_BOTTOM = 18;

/**
 * A token's price on a log scale (memecoins move in multiples), with a playhead. The stretch
 * from `from` to the playhead is drawn in the run's colour; markers pop in as the playhead
 * passes them. With no playhead the whole run shows at once.
 *
 * The line is SVG stretched to the box; the playhead, its bubble and the markers are HTML on top
 * so they stay round and crisp at any width.
 */
export function ReplayChart({
  series,
  from,
  to,
  head,
  markers = [],
  tone,
  bubble,
  athTs,
  hideRun = false,
  className,
}: {
  series: readonly [number, number][];
  /** Where the highlighted run starts and ends (timestamps). */
  from?: number;
  to?: number;
  /** The playhead's timestamp; undefined shows the finished run. */
  head?: number;
  markers?: Marker[];
  tone?: 'pos' | 'neg' | null;
  /** Text in the bubble riding the playhead, e.g. the running P&L. */
  bubble?: string;
  athTs?: number;
  /** Draw only the price line, nothing about the run (before a call is made). */
  hideRun?: boolean;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  const geo = useMemo(() => {
    if (series.length < 2) return null;
    const t0 = series[0]![0];
    const t1 = Math.max(series.at(-1)![0], ...markers.map((m) => m.ts), to ?? 0);
    let lo = Infinity;
    let hi = 0;
    for (const [, p] of series) {
      if (p > 0) {
        lo = Math.min(lo, p);
        hi = Math.max(hi, p);
      }
    }
    for (const m of markers) {
      if (m.price > 0 && m.ts >= t0) {
        lo = Math.min(lo, m.price);
        hi = Math.max(hi, m.price);
      }
    }
    const llo = Math.log(lo);
    const lhi = Math.log(hi === lo ? hi * 1.1 : hi);
    const x = (ts: number) => ((ts - t0) / Math.max(1, t1 - t0)) * VW;
    const y = (p: number) => VH - PAD_BOTTOM - ((Math.log(Math.max(p, lo)) - llo) / Math.max(1e-9, lhi - llo)) * (VH - PAD_TOP - PAD_BOTTOM);
    /** Price at any time, between candles on a straight line. */
    const at = (ts: number) => {
      if (ts <= series[0]![0]) return series[0]![1];
      for (let i = 1; i < series.length; i++) {
        const [ta, pa] = series[i - 1]!;
        const [tb, pb] = series[i]!;
        if (ts <= tb) return pa + ((pb - pa) * (ts - ta)) / Math.max(1, tb - ta);
      }
      return series.at(-1)![1];
    };
    const path = (a: number, b: number) => {
      const pts: [number, number][] = [[a, at(a)]];
      for (const p of series) if (p[0] > a && p[0] < b) pts.push(p);
      pts.push([b, at(b)]);
      return pts.map(([ts, p], i) => `${i ? 'L' : 'M'}${x(ts).toFixed(1)},${y(p).toFixed(1)}`).join('');
    };
    return { x, y, at, path, t0, t1 };
  }, [series, markers, to]);

  if (!geo) return <div className={cx('grid aspect-[5/2] place-items-center rounded-xl bg-subtle text-sm text-muted', className)}>Not enough trades for a chart yet.</div>;

  const full = geo.path(geo.t0, series.at(-1)![0]);
  const runFrom = from ?? geo.t0;
  const runTo = to ?? series.at(-1)![0];
  const playhead = head === undefined ? runTo : Math.min(runTo, Math.max(runFrom, head));
  const showRun = !hideRun && playhead > runFrom;
  const run = showRun ? geo.path(runFrom, playhead) : null;
  const runArea = run ? `${run}L${geo.x(playhead).toFixed(1)},${VH}L${geo.x(runFrom).toFixed(1)},${VH}Z` : null;
  const color = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--ink)';
  const headPrice = geo.at(playhead);
  const hx = (geo.x(playhead) / VW) * 100;
  const hy = (geo.y(headPrice) / VH) * 100;
  const live = head !== undefined && head < runTo;
  const ath = athTs !== undefined ? series.find(([ts]) => ts === athTs) : undefined;

  return (
    <div className={cx('relative aspect-[5/2] w-full select-none', className)}>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`run${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.16" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={VW} y1={VH * f} y2={VH * f} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={full} fill="none" stroke="var(--ink)" strokeOpacity={showRun ? 0.22 : 0.85} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {runArea && <path d={runArea} fill={`url(#run${gid})`} />}
        {run && <path d={run} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
        {showRun && live && <line x1={geo.x(playhead)} x2={geo.x(playhead)} y1="0" y2={VH} stroke={color} strokeOpacity="0.35" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
      </svg>

      {ath && !live && (
        <span
          className="absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted"
          style={{ left: `${Math.min(96, Math.max(4, (geo.x(ath[0]) / VW) * 100))}%`, top: `${(geo.y(ath[1]) / VH) * 100 - 2}%` }}
        >
          ATH
        </span>
      )}

      {!hideRun &&
        markers
          .filter((m) => m.ts >= geo.t0 && m.ts <= playhead + 1)
          .map((m, i) => (
            <span
              key={`${m.ts}:${i}`}
              className={cx(
                'pop-in absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-[var(--surface)] font-semibold leading-none text-white shadow-sm',
                m.label ? 'h-5 px-1.5 text-[9.5px]' : 'size-4 text-[8px]',
                m.kind === 'buy' ? 'bg-pos' : 'bg-neg',
              )}
              style={{ left: `${(geo.x(m.ts) / VW) * 100}%`, top: `${(geo.y(m.price) / VH) * 100}%` }}
            >
              {m.label ?? (m.kind === 'buy' ? 'B' : 'S')}
            </span>
          ))}

      {showRun && (
        <>
          <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${hx}%`, top: `${hy}%` }} aria-hidden>
            {live && <span className="absolute inset-0 -m-2 animate-ping rounded-full opacity-40" style={{ background: color }} />}
            <span className="relative block size-3 rounded-full border-2 border-[var(--surface)] shadow" style={{ background: color }} />
          </span>
          {bubble && (
            <span
              className={cx(
                'num pointer-events-none absolute -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-semibold text-white shadow-sm',
                hx > 70 ? '-translate-x-full' : hx < 30 ? '' : '-translate-x-1/2',
              )}
              style={{ left: `${hx}%`, top: `${hy}%`, background: color }}
            >
              {bubble}
            </span>
          )}
        </>
      )}
    </div>
  );
}
