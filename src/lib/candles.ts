import type { Marker } from '../components/ReplayChart';

/** A price candle as [unix seconds at open, open, high, low, close], USD per token. */
export type Candle = [number, number, number, number, number];

/** Candles from GeckoTerminal's [ts, open, high, low, close, volume] rows, oldest first. */
export function toCandles(ohlcv: readonly number[][]): Candle[] {
  return ohlcv
    .filter((c) => c.length >= 5 && c[1]! > 0 && c[2]! > 0 && c[3]! > 0 && c[4]! > 0)
    .map((c): Candle => [c[0]!, c[1]!, c[2]!, c[3]!, c[4]!])
    .sort((a, b) => a[0] - b[0]);
}

/** The candle size in seconds: the most common gap between candles. */
export function stepOf(candles: readonly Candle[]): number {
  const counts = new Map<number, number>();
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i]![0] - candles[i - 1]![0];
    if (d > 0) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best = 60;
  let n = 0;
  for (const [d, c] of counts) if (c > n || (c === n && d < best)) [best, n] = [d, c];
  return best;
}

/**
 * At most `max` candles over the same stretch: neighbours merged `k` at a time on a grid of
 * `k` steps, so each merged candle covers an even span (open of the first, close of the last).
 */
export function bucket(candles: readonly Candle[], max: number): { candles: Candle[]; step: number } {
  const base = stepOf(candles);
  if (candles.length <= max) return { candles: [...candles], step: base };
  const t0 = candles[0]![0];
  const span = candles.at(-1)![0] - t0 + base;
  const k = Math.ceil(span / base / max);
  const step = base * k;
  const out: Candle[] = [];
  for (const [ts, o, h, l, c] of candles) {
    const at = t0 + Math.floor((ts - t0) / step) * step;
    const last = out.at(-1);
    if (last && last[0] === at) {
      last[2] = Math.max(last[2], h);
      last[3] = Math.min(last[3], l);
      last[4] = c;
    } else out.push([at, o, h, l, c]);
  }
  return { candles: out, step };
}

/**
 * The candles as they stood at `head`: those closed by then whole, the one still open drawn part
 * way from its open toward its close (the feed has nothing finer), and none after.
 */
export function upTo(candles: readonly Candle[], step: number, head: number): Candle[] {
  const out: Candle[] = [];
  for (const k of candles) {
    const [ts, o, h, l, c] = k;
    if (ts + step <= head) out.push(k);
    else if (ts <= head) {
      const f = (head - ts) / step;
      const now = o + (c - o) * f;
      out.push([ts, o, Math.max(o, now, o + (h - o) * f), Math.min(o, now, o + (l - o) * f), now]);
    } else break;
  }
  return out;
}

/** The candle covering a moment, or the nearest one. */
export function candleAt(candles: readonly Candle[], step: number, ts: number): Candle | undefined {
  let best: Candle | undefined;
  for (const k of candles) {
    if (k[0] <= ts) best = k;
    else break;
  }
  return best && ts < best[0] + step ? best : (best ?? candles[0]);
}

/** Price levels for an axis on a log scale: `n` round-ish prices spread evenly between lo and hi. */
export function logTicks(lo: number, hi: number, n: number): number[] {
  if (!(lo > 0) || !(hi > lo)) return lo > 0 ? [lo] : [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = Math.exp(Math.log(lo) + ((Math.log(hi) - Math.log(lo)) * (i + 0.5)) / n);
    const mag = 10 ** Math.floor(Math.log10(p));
    const r = (Math.round((p / mag) * 10) / 10) * mag;
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

/** The low and high a chart has to fit: every candle's wick, plus any extra prices. */
export function range(candles: readonly Candle[], extra: readonly number[] = []): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = 0;
  for (const [, , h, l] of candles) {
    lo = Math.min(lo, l);
    hi = Math.max(hi, h);
  }
  for (const p of extra) {
    if (p > 0) {
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
    }
  }
  if (!Number.isFinite(lo)) return { lo: 1, hi: 1.1 };
  return { lo, hi: hi > lo ? hi : lo * 1.1 };
}

export interface CandleStyle {
  up: string;
  down: string;
  /** Body width as a share of the candle's slot. */
  body?: number;
  wick?: number;
  alpha?: number;
}

/** Candles on a canvas, `X` and `Y` mapping time and price to pixels. */
export function drawCandles(g: CanvasRenderingContext2D, candles: readonly Candle[], step: number, X: (ts: number) => number, Y: (p: number) => number, s: CandleStyle) {
  if (!candles.length) return;
  const slot = Math.abs(X(candles[0]![0] + step) - X(candles[0]![0]));
  const bw = Math.max(1, slot * (s.body ?? 0.7));
  const prev = g.globalAlpha;
  g.globalAlpha = prev * (s.alpha ?? 1);
  for (const [ts, o, h, l, c] of candles) {
    const color = c >= o ? s.up : s.down;
    const cx = X(ts + step / 2);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = s.wick ?? Math.max(1, Math.min(4, slot * 0.12));
    g.beginPath();
    g.moveTo(cx, Y(h));
    g.lineTo(cx, Y(l));
    g.stroke();
    const top = Y(Math.max(o, c));
    const bottom = Y(Math.min(o, c));
    g.fillRect(cx - bw / 2, top, bw, Math.max(2, bottom - top));
  }
  g.globalAlpha = prev;
}

/**
 * Trades close together as one marker, so they do not pile up: trades whose candles are at most
 * `gap` candles from the first in their group (on a phone a candle is a few pixels wide, narrower
 * than a marker). A group of one kind is one B or S; one with both is "B/S", coloured by its last
 * trade. It sits at the first trade's time (so it pops when the replay reaches it) and at the
 * lowest buy or the highest sell.
 */
export function mergeMarkers(markers: readonly Marker[], candles: readonly Candle[], step: number, gap = 3): Marker[] {
  const groups: { at: number; list: Marker[] }[] = [];
  const index = (ts: number) => {
    const k = candleAt(candles, step, ts);
    return k ? candles.indexOf(k) : Math.round(ts / Math.max(1, step));
  };
  for (const m of [...markers].sort((a, b) => a.ts - b.ts)) {
    const i = index(m.ts);
    const g = groups.at(-1);
    if (g && i - g.at <= gap) g.list.push(m);
    else groups.push({ at: i, list: [m] });
  }
  return groups.map(({ list }) => {
    const last = list.at(-1)!;
    const mixed = list.some((m) => m.kind !== list[0]!.kind);
    const same = list.filter((m) => m.kind === last.kind).map((m) => m.price);
    return {
      ts: list[0]!.ts,
      price: last.kind === 'buy' ? Math.min(...same) : Math.max(...same),
      kind: last.kind,
      ...(mixed ? { label: 'B/S' } : {}),
    };
  });
}
