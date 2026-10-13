'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { bucket, candleAt, logTicks, range, upTo, type Candle } from '../lib/candles';
import { cx } from '../lib/cx';
import { COLORS, shape } from '../lib/chartStyle';
import { useChartStyle } from '../hooks/useChartStyle';

export interface Marker {
  ts: number;
  price: number;
  kind: 'buy' | 'sell';
  /** Short text on the marker; B or S when left out. */
  label?: string;
}

const VW = 1000;
const VH = 420;
const PAD_TOP = 48;
const PAD_BOTTOM = 44;
/** Narrowest a candle may be on screen, in pixels: thinner ones blur into grey dots, so neighbours merge. */
const MIN_PX = 3;
/** Room an axis label needs, in screen pixels: its height and a little air. */
const LABEL_PX = 20;

/**
 * A token's candles on a log scale (memecoins move in multiples), the way DexScreener and
 * TradingView draw them, with a playhead. Candles after the playhead are not drawn yet and the
 * one under it grows; buys pop in under their candle and sells over it. With no playhead the
 * whole run shows at once. The price axis, its tags and the markers are HTML on top so they stay
 * crisp at any width. Candles merge when there are more than the chart's width holds.
 */
export function ReplayChart({
  candles: all,
  step: allStep,
  from,
  to,
  head,
  markers = [],
  tone,
  bubble,
  scale = 1,
  label,
  className,
}: {
  candles: readonly Candle[];
  /** Seconds each candle covers. */
  step: number;
  /** Where the run starts and ends (timestamps). */
  from?: number;
  to?: number;
  /** The playhead's timestamp; undefined shows the finished run. */
  head?: number;
  markers?: Marker[];
  tone?: 'pos' | 'neg' | null;
  /** Text in the bubble riding the playhead, e.g. the running P&L. */
  bubble?: string;
  /** What the axis shows instead of price, e.g. market cap: price times `scale`. */
  scale?: number;
  /** Formats an axis value (already scaled). */
  label: (v: number) => string;
  className?: string;
}) {
  // the plot's width on screen, so candles never get thinner than MIN_PX
  const plot = useRef<HTMLDivElement>(null);
  const [style] = useChartStyle();
  const [px, setPx] = useState(0);
  const [tall, setTall] = useState(0);
  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setPx(Math.round(e!.contentRect.width));
      setTall(Math.round(e!.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { candles, step } = useMemo(() => {
    const max = Math.max(20, Math.floor(px / MIN_PX));
    return px && all.length > max ? bucket(all, max) : { candles: all, step: allStep };
  }, [all, allStep, px]);

  const geo = useMemo(() => {
    if (candles.length < 2) return null;
    const t0 = candles[0]![0];
    const t1 = Math.max(candles.at(-1)![0] + step, to ?? 0);
    const { lo, hi } = range(candles, markers.filter((m) => m.ts >= t0).map((m) => m.price));
    const llo = Math.log(lo);
    const lhi = Math.log(hi);
    const x = (ts: number) => ((ts - t0) / Math.max(1, t1 - t0)) * VW;
    const y = (p: number) => VH - PAD_BOTTOM - ((Math.log(Math.max(p, lo)) - llo) / Math.max(1e-9, lhi - llo)) * (VH - PAD_TOP - PAD_BOTTOM);
    return { x, y, t0, t1, ticks: logTicks(lo * scale, hi * scale, 4).map((v) => v / scale) };
  }, [candles, step, markers, to, scale]);

  if (!geo) return <div className={cx('grid aspect-[5/2] place-items-center rounded-xl bg-subtle text-sm text-muted', className)}>Not enough trades for a chart yet.</div>;

  const runFrom = from ?? geo.t0;
  const runTo = to ?? geo.t1;
  const playhead = head === undefined ? runTo : Math.min(runTo, Math.max(runFrom, head));
  const shown = upTo(candles, step, playhead);
  // drawn in the picked shape; the price tag keeps the real last price
  const drawn = shape(shown, style.kind);
  const palette = COLORS[style.colors];
  const live = head !== undefined && head < runTo;
  const color = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--ink)';
  const now = shown.at(-1)?.[4] ?? candles[0]![4];
  const slot = (step / Math.max(1, geo.t1 - geo.t0)) * VW;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const hx = geo.x(playhead);
  const hy = geo.y(now);
  // axis labels make way for the price tag, and for each other, by real pixels: a phone's chart is
  // short, so a share of its height is less than a label is tall
  const gap = (LABEL_PX / Math.max(1, tall || 200)) * VH;
  const labels: number[] = [];
  for (const p of geo.ticks) if (Math.abs(geo.y(p) - hy) > gap && labels.every((q) => Math.abs(geo.y(q) - geo.y(p)) > gap * 0.8)) labels.push(p);

  return (
    <div className={cx('relative flex aspect-[5/2] w-full select-none', className)}>
      <div ref={plot} className="relative min-w-0 flex-1">
        <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          {geo.ticks.map((p) => (
            <line key={p} x1="0" x2={VW} y1={geo.y(p)} y2={geo.y(p)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
          ))}
          {drawn.map(([ts, o, h, l, c]) => {
            const up = c >= o;
            const cx0 = geo.x(ts + step / 2);
            const top = geo.y(Math.max(o, c));
            const bottom = geo.y(Math.min(o, c));
            return (
              <g key={ts} stroke={up ? palette.up : palette.down} fill={up ? palette.up : palette.down}>
                <line x1={cx0} x2={cx0} y1={geo.y(h)} y2={geo.y(l)} strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
                <rect x={cx0 - (slot * 0.7) / 2} y={top} width={Math.max(0.5, slot * 0.7)} height={Math.max(1.5, bottom - top)} stroke="none" />
              </g>
            );
          })}
        </svg>

        {markers
          .filter((m) => m.ts >= geo.t0 && m.ts <= playhead + 1)
          .map((m, i) => {
            const k = candleAt(candles, step, m.ts);
            const buy = m.kind === 'buy';
            const at = buy ? Math.min(k?.[3] ?? m.price, m.price) : Math.max(k?.[2] ?? m.price, m.price);
            return (
              <span
                key={`${m.ts}:${i}`}
                className={cx('pop-in absolute flex -translate-x-1/2 flex-col items-center leading-none', buy ? 'mt-1' : '-translate-y-full flex-col-reverse -mt-1')}
                style={{ left: pct(geo.x(k ? k[0] + step / 2 : m.ts), VW), top: pct(geo.y(at), VH) }}
              >
                <span className={cx('text-[9px]', buy ? 'text-pos' : 'text-neg')} aria-hidden>
                  {buy ? '▲' : '▼'}
                </span>
                <span className={cx('rounded px-1 py-0.5 text-[9.5px] font-semibold text-white shadow-sm', buy ? 'bg-pos' : 'bg-neg')}>{m.label ?? (buy ? 'B' : 'S')}</span>
              </span>
            );
          })}

        {live && (
          <>
            <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pct(hx, VW), top: pct(hy, VH) }} aria-hidden>
              <span className="absolute inset-0 -m-2 animate-ping rounded-full opacity-40" style={{ background: color }} />
              <span className="relative block size-2.5 rounded-full border-2 border-[var(--surface)] shadow" style={{ background: color }} />
            </span>
            {bubble && (
              <span
                className={cx('num pointer-events-none absolute -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-semibold text-white shadow-sm', hx > 700 ? '-translate-x-full' : hx < 300 ? '' : '-translate-x-1/2')}
                style={{ left: pct(hx, VW), top: pct(hy, VH), background: color }}
              >
                {bubble}
              </span>
            )}
          </>
        )}
      </div>

      {/* the price axis */}
      <div className="num relative w-14 shrink-0 text-[10px] text-muted sm:w-16" aria-hidden>
        {labels.map((p) => (
          <span key={p} className="absolute left-1.5 -translate-y-1/2" style={{ top: pct(geo.y(p), VH) }}>
            {label(p * scale)}
          </span>
        ))}
        <span className="absolute left-0.5 -translate-y-1/2 rounded px-1 py-0.5 font-semibold text-white" style={{ top: pct(hy, VH), background: color }}>
          {label(now * scale)}
        </span>
      </div>
    </div>
  );
}
