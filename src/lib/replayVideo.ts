import type { Marker } from '../components/ReplayChart';
import { renderSound, SAMPLE_RATE, tickStep, type Cue } from './videoSound';
import { X_LIGHT } from './palette';
import { candleAt, drawCandles, logTicks, range, upTo, type Candle } from './candles';

/**
 * A video of one replay, drawn on a canvas and encoded in the browser: MP4 (H.264 + AAC) through
 * Mediabunny and WebCodecs where the browser can, WebM (VP9 + Opus) otherwise, and MediaRecorder
 * (no sound) as the last resort. Nothing but the run is in the frame: no app name, no logo, no
 * link. The beats:
 *
 *   lead-in  a beat on the bare chart
 *   replay   the playhead runs the chart, the P&L counts, trades pop in (and in the story cut, a
 *            caption at each big moment of the run and each sell's P&L floating up off it)
 *   hold     the camera pulls back to the whole chart and holds there, the final number on it
 */

export type VideoFormat = 'landscape' | 'square' | 'portrait';
export type VideoLength = 'short' | 'story';

export const FORMATS: Record<VideoFormat, { width: number; height: number; label: string; ratio: string; hint: string }> = {
  landscape: { width: 1920, height: 1080, label: 'YouTube', ratio: '16:9', hint: 'YouTube, desktop' },
  square: { width: 1080, height: 1080, label: 'Square', ratio: '1:1', hint: 'X, feeds' },
  portrait: { width: 1080, height: 1920, label: 'Vertical', ratio: '9:16', hint: 'Shorts, TikTok, Reels' },
};

interface Timing {
  seconds: number;
  /** The bare chart holds until here; the replay then runs to `play`. */
  hook: number;
  play: number;
}

export const LENGTHS: Record<VideoLength, Timing & { label: string; note: string }> = {
  short: { seconds: 9, hook: 0.5, play: 5.6, label: 'Short', note: '' },
  story: { seconds: 18, hook: 0.6, play: 13, label: 'Story', note: ', the run told in its big moments' },
};

/**
 * For a paced video: candles a second the replay runs at, and the shortest and longest the replay
 * may take, so a young token isn't over in a blink and a long history still fits a clip.
 */
const PACE: Record<VideoLength, { rate: number; min: number; max: number }> = {
  short: { rate: 10, min: 2.5, max: 9 },
  story: { rate: 5, min: 5, max: 20 },
};

/**
 * The video's beats in seconds. A paced run plays its candles at a steady rate, so the video is as
 * long as the run is; any other run fits the length's fixed seconds.
 */
export function timingOf(l: VideoLength, v?: Run): Timing {
  const T = LENGTHS[l];
  const n = v?.paced ? (v.candles?.length ?? 0) : 0;
  if (!n) return T;
  const P = PACE[l];
  const play = T.hook + Math.min(P.max, Math.max(P.min, n / P.rate));
  // whole frames, so the export and the preview agree on the length
  const seconds = Math.round((play + T.seconds - T.play) * FPS) / FPS;
  return { seconds, hook: T.hook, play };
}

export const FPS = 30;

export interface Caption {
  ts: number;
  text: string;
  tone: 'pos' | 'neg' | null;
}

/** A number that floats up off a trade's marker in the story cut, e.g. what a sell made. */
export interface Pop {
  /** The marker it rises from. */
  ts: number;
  price: number;
  text: string;
  tone: 'pos' | 'neg' | null;
}

export interface ReplayVideo {
  /** A small line above the ticker, e.g. a wallet's short address; nothing for a paper trade. */
  kicker?: string;
  symbol: string;
  chainName: string;
  series: readonly [number, number][];
  /** The chart as candles over the same stretch, `step` seconds each. */
  candles: readonly Candle[];
  step: number;
  from: number;
  to: number;
  markers: Marker[];
  /** The run's big moments, a few at most, shown in the story cut as the playhead passes each. */
  captions: Caption[];
  /** Floated up off the markers in the story cut; each must sit on one of `markers`. */
  pops?: Pop[];
  /** The P&L in USD with the playhead at a time; its sign colours the counter. */
  pnlAt: (ts: number) => number;
  /** What the counter reads with the playhead at a time, e.g. the market cap; the P&L when left out. */
  counter?: (ts: number) => string;
  /** The final P&L: its sign picks the closing chord. */
  pnl: number;
  money: (n: number) => string;
  /** What the axis shows instead of price, e.g. market cap: price times `scale`. */
  scale: number;
  /** Run the candles at a steady pace, the video as long as the run, instead of fitting the length's fixed seconds. */
  paced?: boolean;
  /** Formats an axis value (already scaled). */
  label: (n: number) => string;
  date: (ts: number) => string;
}

const { bg: BG, ink: INK, muted: MUTED, line: LINE, pos: POS, neg: NEG } = X_LIGHT;
const SANS = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeInOut = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
const easeBack = (x: number) => {
  const v = clamp01(x);
  const c = 1.70158;
  return 1 + (c + 1) * (v - 1) ** 3 + c * (v - 1) ** 2;
};

/** What the timing needs of a run: its stretch and, for the slow motion, its trades. */
type Run = Pick<ReplayVideo, 'from' | 'to'> & Partial<Pick<ReplayVideo, 'candles' | 'paced'>> & { markers?: readonly Marker[] };

/** How much slower the replay runs right on a trade, and over how much of the run it eases back. */
const SLOW = 2.4;
const SLOW_WIDTH = 0.035;
const WARP_STEPS = 512;
const warps = new WeakMap<object, Float64Array | null>();

/**
 * Slow motion around trades, as a table: the share of the replay's time spent by each point of the
 * run, which rises near every trade. Null when there are no trades to slow down for.
 */
function warpTable(v: Run): Float64Array | null {
  if (warps.has(v)) return warps.get(v)!;
  const span = Math.max(1, v.to - v.from);
  const at = (v.markers ?? []).map((m) => (m.ts - v.from) / span).filter((u) => u >= 0 && u <= 1);
  let table: Float64Array | null = null;
  if (at.length) {
    table = new Float64Array(WARP_STEPS + 1);
    for (let i = 1; i <= WARP_STEPS; i++) {
      const u = (i - 0.5) / WARP_STEPS;
      let w = 1;
      for (const a of at) w += SLOW * Math.exp(-(((u - a) / SLOW_WIDTH) ** 2));
      table[i] = table[i - 1]! + w;
    }
    const total = table[WARP_STEPS]!;
    for (let i = 0; i <= WARP_STEPS; i++) table[i] = table[i]! / total;
  }
  warps.set(v, table);
  return table;
}

/** The point of the run reached once a share `x` of the replay's time has passed. */
function warp(x: number, table: Float64Array | null): number {
  if (!table || x <= 0 || x >= 1) return clamp01(x);
  let lo = 0;
  let hi = WARP_STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const a = table[lo]!;
  const b = table[hi]!;
  return (lo + (x - a) / Math.max(1e-12, b - a)) / WARP_STEPS;
}

/**
 * How far the playhead has run, 0 to 1. The story cut keeps a steadier pace so captions can be
 * read; given the run, the replay slows down as it reaches each trade.
 */
export function playAt(time: number, l: VideoLength = 'short', v?: Run): number {
  const T = timingOf(l, v);
  const x = (time - T.hook) / (T.play - T.hook);
  const eased = l === 'story' ? clamp01(x) * 0.5 + easeInOut(x) * 0.5 : easeInOut(x);
  return v ? warp(eased, warpTable(v)) : eased;
}

/** The time in the video at which the playhead reaches a timestamp of the run. */
export function timeOf(ts: number, v: Run, l: VideoLength): number {
  const T = timingOf(l, v);
  const target = (ts - v.from) / Math.max(1, v.to - v.from);
  let lo = T.hook;
  let hi = T.play;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (playAt(mid, l, v) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

const toneColor = (n: number) => (n > 1e-9 ? POS : n < -1e-9 ? NEG : INK);

interface Layout {
  W: number;
  H: number;
  pad: number;
  headerY: number;
  symbolSize: number;
  chart: { x0: number; x1: number; y0: number; y1: number };
  counter: { x: number; y: number; size: number; align: CanvasTextAlign };
  caption: { x: number; y: number; size: number };
}

function layout(f: VideoFormat): Layout {
  const { width: W, height: H } = FORMATS[f];
  if (f === 'landscape')
    return {
      W,
      H,
      pad: 96,
      headerY: 150,
      symbolSize: 76,
      chart: { x0: 96, x1: W - 96, y0: 340, y1: H - 120 },
      counter: { x: W - 96, y: 150, size: 120, align: 'right' },
      caption: { x: 96, y: 238, size: 34 },
    };
  if (f === 'square')
    return {
      W,
      H,
      pad: 72,
      headerY: 140,
      symbolSize: 72,
      chart: { x0: 72, x1: W - 72, y0: 470, y1: H - 110 },
      counter: { x: 72, y: 280, size: 120, align: 'left' },
      caption: { x: 72, y: 362, size: 32 },
    };
  return {
    W,
    H,
    pad: 80,
    headerY: 230,
    symbolSize: 92,
    chart: { x0: 80, x1: W - 80, y0: 750, y1: 1480 },
    counter: { x: 80, y: 470, size: 160, align: 'left' },
    caption: { x: 80, y: 585, size: 40 },
  };
}

function font(g: CanvasRenderingContext2D, size: number, weight = 400) {
  g.font = `${weight} ${size}px ${SANS}`;
}

/** Sets the largest font up to `size` at which `text` fits in `max` pixels. */
function fit(g: CanvasRenderingContext2D, text: string, size: number, weight: number, max: number) {
  font(g, size, weight);
  const w = g.measureText(text).width;
  if (w > max) font(g, Math.floor((size * max) / w), weight);
}

/** Width kept at the chart's right for the price axis. */
const axisW = (L: Layout) => (L.H > L.W ? 190 : 170);

/** What the chart frames: a stretch of time and a band of prices (as logs). */
interface View {
  ta: number;
  tb: number;
  llo: number;
  lhi: number;
}

/** The whole chart. */
function fullView(v: ReplayVideo): View {
  const s = v.series.filter(([, p]) => p > 0);
  const c = v.candles;
  const ta = c[0]?.[0] ?? s[0]?.[0] ?? v.from;
  const tb = Math.max((c.at(-1)?.[0] ?? s.at(-1)?.[0] ?? v.to) + (c.length ? v.step : 0), v.to);
  const { lo, hi } = range(c, [...s.map(([, p]) => p), ...v.markers.filter((m) => m.ts >= ta).map((m) => m.price)]);
  return { ta, tb, llo: Math.log(lo), lhi: Math.log(hi) };
}

/** How much closer than the whole chart the camera gets while it follows the playhead. */
const ZOOM = 2.6;

/** The camera on the playhead: the latest candles, the playhead a little right of centre. `wide` pulls it back. */
function followView(v: ReplayVideo, full: View, head: number, wide = 1): View {
  const w = Math.max((full.tb - full.ta) / ZOOM, v.step * 14) * wide;
  let tb = head + w * 0.3;
  let ta = tb - w;
  if (ta < full.ta) [ta, tb] = [full.ta, full.ta + w];
  const seen = upTo(v.candles, v.step, head).filter((k) => k[0] + v.step >= ta);
  const { lo, hi } = range(seen.length ? seen : v.candles, v.markers.filter((m) => m.ts >= ta && m.ts <= head).map((m) => m.price));
  const d = Math.max(Math.log(hi) - Math.log(lo), 0.04);
  // room above and below for the trade markers
  return { ta, tb, llo: Math.log(lo) - d * 0.16, lhi: Math.log(hi) + d * 0.16 };
}

/** How close the camera is, 1 (on the playhead) to 0 (the whole chart): it pulls back out at the end of the replay. */
export function zoomAt(time: number, l: VideoLength = 'short', v?: Run): number {
  const T = timingOf(l, v);
  return 1 - easeInOut((time - (T.play - 1)) / 1);
}

/**
 * The camera at a moment: the whole chart blended toward the follow view. The follow view is
 * averaged over the last half second of the run so the frame drifts instead of jumping when a
 * new high comes in or an old candle leaves.
 */
function cameraAt(v: ReplayVideo, full: View, time: number, l: VideoLength): View {
  const z = zoomAt(time, l, v);
  if (z <= 0) return full;
  const T = timingOf(l, v);
  // a slow push in over the opening
  const wide = 1 + 0.3 * (1 - easeInOut(time / (T.hook + 1)));
  const n = 8;
  const f = { ta: 0, tb: 0, llo: 0, lhi: 0 };
  for (let i = 0; i < n; i++) {
    const t = Math.max(T.hook, time - i * 0.07);
    const head = v.from + (v.to - v.from) * playAt(t, l, v);
    const k = followView(v, full, head, wide);
    f.ta += k.ta / n;
    f.tb += k.tb / n;
    f.llo += k.llo / n;
    f.lhi += k.lhi / n;
  }
  const mix = (a: number, b: number) => a + (b - a) * z;
  return { ta: mix(full.ta, f.ta), tb: mix(full.tb, f.tb), llo: mix(full.llo, f.llo), lhi: mix(full.lhi, f.lhi) };
}

function geometry(v: ReplayVideo, L: Layout, view: View = fullView(v)) {
  const s = v.series.filter(([, p]) => p > 0);
  const { ta, tb, llo, lhi } = view;
  const { x0, y0, y1 } = L.chart;
  const x1 = L.chart.x1 - axisW(L);
  const X = (ts: number) => x0 + ((ts - ta) / Math.max(1, tb - ta)) * (x1 - x0);
  const level = (p: number) => (Math.log(Math.max(p, 1e-300)) - llo) / Math.max(1e-9, lhi - llo);
  const Y = (p: number) => y1 - level(p) * (y1 - y0);
  const at = (ts: number) => {
    if (!s.length) return 0;
    if (ts <= s[0]![0]) return s[0]![1];
    for (let i = 1; i < s.length; i++) {
      const [sa, pa] = s[i - 1]!;
      const [sb, pb] = s[i]!;
      if (ts <= sb) return pa + ((pb - pa) * (ts - sa)) / Math.max(1, sb - sa);
    }
    return s.at(-1)![1];
  };
  return { s, t0: v.candles[0]?.[0] ?? s[0]?.[0] ?? v.from, x1, X, Y, at, level, ticks: logTicks(Math.exp(llo) * v.scale, Math.exp(lhi) * v.scale, 4).map((t) => t / v.scale) };
}

/** One frame at `time` seconds. */
export function drawFrame(g: CanvasRenderingContext2D, time: number, v: ReplayVideo, f: VideoFormat, l: VideoLength = 'short') {
  g.globalAlpha = 1;
  drawScene(g, time, v, f, l, 1);
  g.globalAlpha = 1;
}

function drawScene(g: CanvasRenderingContext2D, time: number, v: ReplayVideo, f: VideoFormat, l: VideoLength, alpha: number) {
  const T = timingOf(l, v);
  const L = layout(f);
  const { W, H, pad } = L;
  const geo = geometry(v, L, cameraAt(v, fullView(v), time, l));
  const p = playAt(time, l, v);
  const head = v.from + (v.to - v.from) * p;
  const playing = time >= T.hook;
  const running = playing ? v.pnlAt(head) : 0;
  const color = toneColor(running);
  const A = (a: number) => (g.globalAlpha = alpha * a);

  // the punch: a jolt that fades fast each time a trade lands
  let punch = 0;
  let punched: Marker | null = null;
  if (playing) {
    for (const m of v.markers) {
      const dt = time - timeOf(Math.max(m.ts, v.from), v, l);
      const k = dt >= 0 ? Math.exp(-dt / 0.22) : 0;
      if (k > punch) [punch, punched] = [k, m];
    }
  }

  A(1);
  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  if (punched && punch > 0.01) {
    A(0.06 * punch);
    g.fillStyle = punched.kind === 'buy' ? POS : NEG;
    g.fillRect(0, 0, W, H);
    A(1);
  }
  g.textBaseline = 'alphabetic';

  // the ticker
  g.textAlign = 'left';
  if (v.kicker) {
    font(g, Math.round(L.symbolSize * 0.4), 500);
    g.fillStyle = MUTED;
    g.fillText(v.kicker, pad, L.headerY - L.symbolSize - 6);
  }
  font(g, L.symbolSize, 650);
  g.fillStyle = INK;
  g.fillText(v.symbol, pad, L.headerY);
  const sw = g.measureText(v.symbol).width;
  font(g, Math.round(L.symbolSize * 0.42), 400);
  g.fillStyle = MUTED;
  g.fillText(v.chainName, pad + sw + 22, L.headerY);

  // the counter
  if (playing) {
    A(easeOut((time - T.hook) / 0.3));
    const text = v.counter ? v.counter(head) : v.money(running);
    fit(g, text, Math.round(L.counter.size * (1 + 0.1 * punch)), 650, L.counter.align === 'right' ? W - pad * 2 - sw - 260 : W - pad * 2);
    g.textAlign = L.counter.align;
    g.fillStyle = color;
    g.fillText(text, L.counter.x, L.counter.y);
    A(1);
  }

  // the latest caption, in the story cut
  if (l === 'story' && playing) {
    let cap: Caption | null = null;
    for (const c of v.captions) if (c.ts <= head) cap = c;
    if (cap) {
      A(clamp01((time - timeOf(Math.max(cap.ts, v.from), v, l)) / 0.25));
      drawPill(g, L.caption.x, L.caption.y, cap.text, L.caption.size, cap.tone === 'pos' ? POS : cap.tone === 'neg' ? NEG : INK, W - pad * 2);
      A(1);
    }
  }

  // the chart: candles up to the playhead, the price axis on the right
  const { x0, y0, y1 } = L.chart;
  const px1 = geo.x1;
  const big = f === 'portrait' ? 1.25 : 1;
  const axisX = px1 + 22;
  const tag = (p: number, fill: string, text: string) => {
    font(g, Math.round(25 * big), 650);
    const w = g.measureText(text).width + 22;
    const h = 40 * big;
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(axisX - 8, geo.Y(p) - h / 2, w, h, 8);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'left';
    g.fillText(text, axisX + 3, geo.Y(p) + 9 * big);
  };
  const shownTo = playing ? head : v.from;
  const shown = upTo(v.candles, v.step, shownTo);
  const nowPrice = shown.at(-1)?.[4] ?? geo.at(shownTo);
  const tagYs = [geo.Y(nowPrice)];
  const inView = (pr: number) => geo.Y(pr) >= y0 - 20 && geo.Y(pr) <= y1 + 20;
  g.lineWidth = 2;
  font(g, Math.round(24 * big), 500);
  g.textAlign = 'left';
  for (const t of geo.ticks) {
    if (!inView(t)) continue;
    g.strokeStyle = LINE;
    g.beginPath();
    g.moveTo(x0, geo.Y(t));
    g.lineTo(px1, geo.Y(t));
    g.stroke();
    if (tagYs.some((y) => Math.abs(y - geo.Y(t)) < 44 * big)) continue;
    g.fillStyle = MUTED;
    g.fillText(v.label(t * v.scale), axisX, geo.Y(t) + 8);
  }
  // the chart is cut to its frame, so candles the camera has left slide out of it
  g.save();
  g.beginPath();
  g.rect(x0, y0 - 110, px1 - x0, y1 - y0 + 140);
  g.clip();
  if (punched && punch > 0.01) {
    // the frame jolts in on the trade that just landed
    const c = candleAt(v.candles, v.step, punched.ts);
    const fx = geo.X(c ? c[0] + v.step / 2 : punched.ts);
    const fy = geo.Y(punched.price);
    const z = 1 + 0.06 * punch;
    g.translate(fx, fy);
    g.scale(z, z);
    g.translate(-fx, -fy);
  }
  drawCandles(g, shown, v.step, geo.X, geo.Y, { up: POS, down: NEG, body: 0.68 });

  // trades pop as the playhead reaches them, buys under their candle and sells over it
  if (playing) {
    for (const m of v.markers) {
      if (m.ts > head || m.ts < geo.t0) continue;
      const k = easeBack((time - timeOf(Math.max(m.ts, v.from), v, l)) / 0.3);
      const c = candleAt(v.candles, v.step, m.ts);
      const buy = m.kind === 'buy';
      const py = buy ? geo.Y(Math.min(c?.[3] ?? m.price, m.price)) : geo.Y(Math.max(c?.[2] ?? m.price, m.price));
      drawMarker(g, geo.X(c ? c[0] + v.step / 2 : m.ts), py, m, k, big);
    }
  }
  g.restore();

  // what each sell made, rising off its marker and fading, in the story cut
  if (l === 'story' && playing) {
    for (const o of v.pops ?? []) {
      if (o.ts > head || o.ts < geo.t0) continue;
      const dt = time - timeOf(Math.max(o.ts, v.from), v, l);
      if (dt >= POP_SECONDS) continue;
      const c = candleAt(v.candles, v.step, o.ts);
      // just over the sell's pill, rising, but never up into the caption
      const y = geo.Y(Math.max(c?.[2] ?? o.price, o.price)) - 92 * big - 48 * big * easeOut(dt / POP_SECONDS);
      const ceiling = L.caption.y + L.caption.size * 1.2 + 48 * big;
      A(clamp01(dt / 0.15) * clamp01((POP_SECONDS - dt) / 0.4));
      drawPop(g, geo.X(c ? c[0] + v.step / 2 : o.ts), Math.max(ceiling, y), o, easeBack(dt / 0.3), big);
      A(1);
    }
  }

  tag(nowPrice, playing ? color : INK, v.label(nowPrice * v.scale));

  // the playhead's date, held in one place under the chart and faded in
  if (playing) {
    A(easeOut((time - T.hook) / 0.3));
    font(g, f === 'portrait' ? 34 : 26, 500);
    g.fillStyle = MUTED;
    g.textAlign = 'left';
    g.fillText(v.date(head), x0, y1 + (f === 'portrait' ? 60 : 46));
    A(1);
  }

  A(1);
}

/** How long a pop shows, rising the whole time. */
const POP_SECONDS = 1.6;

function drawPop(g: CanvasRenderingContext2D, x: number, y: number, o: Pop, k: number, scale: number) {
  if (k <= 0) return;
  g.save();
  g.translate(x, y);
  g.scale(k * scale, k * scale);
  font(g, 38, 750);
  g.textAlign = 'center';
  g.lineJoin = 'round';
  g.lineWidth = 10;
  g.strokeStyle = BG;
  g.strokeText(o.text, 0, 0);
  g.fillStyle = o.tone === 'pos' ? POS : o.tone === 'neg' ? NEG : INK;
  g.fillText(o.text, 0, 0);
  g.restore();
}

function drawPill(g: CanvasRenderingContext2D, x: number, y: number, text: string, size: number, color: string, max: number) {
  fit(g, text, size, 600, max - size * 1.1);
  const w = g.measureText(text).width + size * 1.1;
  const h = size * 1.7;
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, y - h * 0.72, w, h, h / 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'left';
  g.fillText(text, x + size * 0.55, y + size * 0.05);
}

/** A trade on its candle: an arrow and a pill, under the candle for a buy and over it for a sell. */
function drawMarker(g: CanvasRenderingContext2D, x: number, y: number, m: Marker, k: number, scale: number) {
  if (k <= 0) return;
  const buy = m.kind === 'buy';
  const dir = buy ? 1 : -1;
  g.save();
  g.translate(x, y + dir * 12 * scale);
  g.scale(k * scale, k * scale);
  g.fillStyle = buy ? POS : NEG;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(-13, dir * 18);
  g.lineTo(13, dir * 18);
  g.closePath();
  g.fill();
  const text = m.label ?? (buy ? 'BUY' : 'SELL');
  font(g, 24, 700);
  const w = g.measureText(text).width + 26;
  const top = buy ? 24 : -24 - 40;
  g.beginPath();
  g.roundRect(-w / 2, top, w, 40, 10);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.fillText(text, 0, top + 29);
  g.restore();
}

/** The sound track's cues: where each blip, tick and chord lands. */
export function soundCues(v: ReplayVideo, l: VideoLength): Cue[] {
  const T = timingOf(l, v);
  const geo = geometry(v, layout('square'));
  const cues: Cue[] = [{ t: 0.02, kind: 'hook' }];
  // a tick each time the price steps onto another note, like a ratchet, so a fast move ticks
  // fast; never closer than GAP, and a slow one still on a quiet stretch
  const GAP = 0.055;
  const QUIET = l === 'story' ? 0.4 : 0.3;
  let last = -Infinity;
  let step = -1;
  for (let t = T.hook; t < T.play; t += 1 / 120) {
    const level = geo.level(geo.at(v.from + (v.to - v.from) * playAt(t, l, v)));
    const s = tickStep(level);
    if (t - last < GAP || (s === step && t - last < QUIET)) continue;
    cues.push({ t, kind: 'tick', pitch: level });
    last = t;
    step = s;
  }
  for (const m of v.markers) if (m.ts <= v.to) cues.push({ t: timeOf(Math.max(m.ts, v.from), v, l), kind: m.kind });
  cues.push({ t: T.play + 0.2, kind: v.pnl > 1e-6 ? 'win' : v.pnl < -1e-6 ? 'loss' : 'even' });
  return cues;
}

export interface RenderedVideo {
  blob: Blob;
  extension: 'mp4' | 'webm';
  /** False when the browser could only record the picture. */
  sound: boolean;
}

async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(['400', '500', '600', '650', '700'].map((w) => document.fonts.load(`${w} 60px 'Inter Variable'`))).catch(() => undefined);
}

export async function renderReplayVideo(
  v: ReplayVideo,
  f: VideoFormat,
  l: VideoLength,
  opts: { sound: boolean },
  onProgress: (p: number) => void = () => {},
): Promise<RenderedVideo> {
  const { width, height } = FORMATS[f];
  const { seconds } = timingOf(l, v);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no canvas');
  await loadFonts();
  const frames = Math.round(FPS * seconds);
  const audio = opts.sound && typeof OfflineAudioContext !== 'undefined' ? await renderSound(soundCues(v, l), seconds).catch(() => null) : null;

  const mb = await import('mediabunny').catch(() => null);
  if (mb && typeof VideoEncoder !== 'undefined') {
    // MP4 with H.264 plays everywhere (and X and Instagram take nothing else), so it comes first
    const choices = [
      { codec: 'avc' as const, audio: 'aac' as const, extension: 'mp4' as const },
      { codec: 'vp9' as const, audio: 'opus' as const, extension: 'webm' as const },
      { codec: 'vp8' as const, audio: 'opus' as const, extension: 'webm' as const },
    ];
    for (const choice of choices) {
      if (!(await mb.canEncodeVideo(choice.codec, { width, height }).catch(() => false))) continue;
      const withSound = !!audio && (await mb.canEncodeAudio(choice.audio, { numberOfChannels: 2, sampleRate: SAMPLE_RATE }).catch(() => false));
      const target = new mb.BufferTarget();
      const format = choice.extension === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat();
      const output = new mb.Output({ format, target });
      const video = new mb.CanvasSource(canvas, { codec: choice.codec, bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 });
      output.addVideoTrack(video, { frameRate: FPS });
      const sound = withSound ? new mb.AudioBufferSource({ codec: choice.audio, bitrate: mb.QUALITY_HIGH }) : null;
      if (sound) output.addAudioTrack(sound);
      await output.start();
      if (sound && audio) await sound.add(audio);
      for (let i = 0; i < frames; i++) {
        drawFrame(g, i / FPS, v, f, l);
        await video.add(i / FPS, 1 / FPS);
        onProgress((i + 1) / frames);
      }
      await output.finalize();
      if (!target.buffer) throw new Error('empty video');
      return { blob: new Blob([target.buffer], { type: format.mimeType }), extension: choice.extension, sound: !!sound };
    }
  }
  return recordInRealTime(canvas, g, v, f, l, onProgress);
}

/** The fallback: plays the video once on the canvas while MediaRecorder captures it (no sound). */
async function recordInRealTime(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D, v: ReplayVideo, f: VideoFormat, l: VideoLength, onProgress: (p: number) => void): Promise<RenderedVideo> {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) throw new Error('no video support');
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!type) throw new Error('no video support');
  const { seconds } = timingOf(l, v);
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  drawFrame(g, 0, v, f, l);
  recorder.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const time = (performance.now() - start) / 1000;
      drawFrame(g, Math.min(time, seconds - 1 / FPS), v, f, l);
      onProgress(Math.min(1, time / seconds));
      if (time >= seconds) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  await stopped;
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), extension: type.startsWith('video/mp4') ? 'mp4' : 'webm', sound: false };
}
