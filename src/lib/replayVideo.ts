import type { Marker } from '../components/ReplayChart';
import { renderSound, SAMPLE_RATE, type Cue } from './videoSound';
import { candleAt, drawCandles, logTicks, range, upTo, type Candle } from './candles';

/**
 * A video of one replay, drawn on a canvas and encoded in the browser: MP4 (H.264 + AAC) through
 * Mediabunny and WebCodecs where the browser can, WebM (VP9 + Opus) otherwise, and MediaRecorder
 * (no sound) as the last resort. Nothing but the run is in the frame: no app name, no logo, no
 * link. The beats:
 *
 *   lead-in  a beat on the bare chart
 *   replay   the playhead runs the chart, the P&L counts, trades pop in (with a caption each in
 *            the story cut)
 *   reveal   the verdict, the P&L, its rank and the numbers behind it, held to the end
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

export const LENGTHS: Record<VideoLength, Timing & { label: string; hint: string }> = {
  short: { seconds: 9, hook: 0.5, play: 5.6, label: 'Short', hint: '9 s' },
  story: { seconds: 18, hook: 0.6, play: 13, label: 'Story', hint: '18 s, a caption per trade' },
};

export const FPS = 30;

export interface Caption {
  ts: number;
  text: string;
  tone: 'pos' | 'neg' | null;
}

export interface ReplayVideo {
  /** A small line above the ticker, e.g. a wallet's short address; nothing for a paper trade. */
  kicker?: string;
  symbol: string;
  chainName: string;
  /** The answer in one line, over the P&L: e.g. "Was 5x up, ended down 40%". */
  verdict: string;
  series: readonly [number, number][];
  /** The chart as candles over the same stretch, `step` seconds each. */
  candles: readonly Candle[];
  step: number;
  /** The average buy, drawn as a dashed line; none when there were no buys. */
  entry?: number;
  from: number;
  to: number;
  markers: Marker[];
  /** One per trade, shown in the story cut as the playhead passes it. */
  captions: Caption[];
  /** The P&L in USD with the playhead at a time. */
  pnlAt: (ts: number) => number;
  pnl: number;
  pnlText: string;
  roiText: string | null;
  rank: { name: string; line: string };
  stats: { k: string; v: string }[];
  money: (n: number) => string;
  /** A token price, for the price axis. */
  price: (n: number) => string;
  date: (ts: number) => string;
}

const INK = '#111113';
const INK2 = '#3f3f46';
const MUTED = '#71717a';
const LINE = '#ebebee';
const SUBTLE = '#f7f7f8';
const POS = '#16a34a';
const NEG = '#dc2626';
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

/** How far the playhead has run, 0 to 1. The story cut keeps a steadier pace so captions can be read. */
export function playAt(time: number, l: VideoLength = 'short'): number {
  const T = LENGTHS[l];
  const x = (time - T.hook) / (T.play - T.hook);
  return l === 'story' ? clamp01(x) * 0.5 + easeInOut(x) * 0.5 : easeInOut(x);
}

export function revealAt(time: number, l: VideoLength = 'short'): number {
  return easeOut((time - LENGTHS[l].play - 0.2) / 0.45);
}

/** The time in the video at which the playhead reaches a timestamp of the run. */
export function timeOf(ts: number, v: Pick<ReplayVideo, 'from' | 'to'>, l: VideoLength): number {
  const T = LENGTHS[l];
  const target = (ts - v.from) / Math.max(1, v.to - v.from);
  let lo = T.hook;
  let hi = T.play;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (playAt(mid, l) < target) lo = mid;
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
  reveal: { top: number; big: number; rankY: number; rankBelow: boolean; statsY: number; cols: number; rowH: number; statSize: number };
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
      reveal: { top: 270, big: 200, rankY: 540, rankBelow: false, statsY: 720, cols: 2, rowH: 84, statSize: 36 },
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
      reveal: { top: 240, big: 170, rankY: 540, rankBelow: true, statsY: 750, cols: 1, rowH: 68, statSize: 34 },
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
    reveal: { top: 440, big: 190, rankY: 760, rankBelow: true, statsY: 1010, cols: 1, rowH: 96, statSize: 42 },
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

function geometry(v: ReplayVideo, L: Layout) {
  const s = v.series.filter(([, p]) => p > 0);
  const c = v.candles;
  const t0 = c[0]?.[0] ?? s[0]?.[0] ?? v.from;
  const t1 = Math.max((c.at(-1)?.[0] ?? s.at(-1)?.[0] ?? v.to) + (c.length ? v.step : 0), v.to);
  const { lo, hi } = range(c, [...s.map(([, p]) => p), ...v.markers.filter((m) => m.ts >= t0).map((m) => m.price), v.entry ?? 0]);
  const llo = Math.log(lo);
  const lhi = Math.log(hi);
  const { x0, y0, y1 } = L.chart;
  const x1 = L.chart.x1 - axisW(L);
  const X = (ts: number) => x0 + ((ts - t0) / Math.max(1, t1 - t0)) * (x1 - x0);
  const level = (p: number) => (Math.log(Math.max(p, lo)) - llo) / Math.max(1e-9, lhi - llo);
  const Y = (p: number) => y1 - level(p) * (y1 - y0);
  const at = (ts: number) => {
    if (!s.length) return 0;
    if (ts <= s[0]![0]) return s[0]![1];
    for (let i = 1; i < s.length; i++) {
      const [ta, pa] = s[i - 1]!;
      const [tb, pb] = s[i]!;
      if (ts <= tb) return pa + ((pb - pa) * (ts - ta)) / Math.max(1, tb - ta);
    }
    return s.at(-1)![1];
  };
  return { s, t0, x1, X, Y, at, level, ticks: logTicks(lo, hi, 4) };
}

/** One frame at `time` seconds. */
export function drawFrame(g: CanvasRenderingContext2D, time: number, v: ReplayVideo, f: VideoFormat, l: VideoLength = 'short') {
  g.globalAlpha = 1;
  drawScene(g, time, v, f, l, 1);
  g.globalAlpha = 1;
}

function drawScene(g: CanvasRenderingContext2D, time: number, v: ReplayVideo, f: VideoFormat, l: VideoLength, alpha: number) {
  const T = LENGTHS[l];
  const L = layout(f);
  const { W, H, pad } = L;
  const geo = geometry(v, L);
  const p = playAt(time, l);
  const head = v.from + (v.to - v.from) * p;
  const playing = time >= T.hook;
  const running = playing ? v.pnlAt(head) : 0;
  const color = toneColor(running);
  const r = revealAt(time, l);
  const A = (a: number) => (g.globalAlpha = alpha * a);

  A(1);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
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
  if (playing && r < 1) {
    A(easeOut((time - T.hook) / 0.3) * (1 - r));
    fit(g, v.money(running), L.counter.size, 650, L.counter.align === 'right' ? W - pad * 2 - sw - 260 : W - pad * 2);
    g.textAlign = L.counter.align;
    g.fillStyle = color;
    g.fillText(v.money(running), L.counter.x, L.counter.y);
    A(1);
  }

  // the latest caption, in the story cut
  if (l === 'story' && playing && r < 1) {
    let cap: Caption | null = null;
    for (const c of v.captions) if (c.ts <= head) cap = c;
    if (cap) {
      A(clamp01((time - timeOf(Math.max(cap.ts, v.from), v, l)) / 0.25) * (1 - r));
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
  const tagYs = [geo.Y(nowPrice), ...(v.entry && v.entry > 0 ? [geo.Y(v.entry)] : [])];
  g.lineWidth = 2;
  font(g, Math.round(24 * big), 500);
  g.textAlign = 'left';
  for (const t of geo.ticks) {
    g.strokeStyle = LINE;
    g.beginPath();
    g.moveTo(x0, geo.Y(t));
    g.lineTo(px1, geo.Y(t));
    g.stroke();
    if (tagYs.some((y) => Math.abs(y - geo.Y(t)) < 44 * big)) continue;
    g.fillStyle = MUTED;
    g.fillText(v.price(t), axisX, geo.Y(t) + 8);
  }
  if (playing && head > v.from) {
    A(0.06);
    g.fillStyle = color;
    g.fillRect(geo.X(v.from), y0 - 20, geo.X(head) - geo.X(v.from), y1 - y0 + 40);
    A(1);
  }
  if (v.entry && v.entry > 0) {
    g.setLineDash([12, 12]);
    g.strokeStyle = 'rgba(63,63,70,0.6)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x0, geo.Y(v.entry));
    g.lineTo(px1, geo.Y(v.entry));
    g.stroke();
    g.setLineDash([]);
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

  if (v.entry && v.entry > 0 && Math.abs(geo.Y(v.entry) - geo.Y(nowPrice)) > 44 * big) tag(v.entry, INK2, v.price(v.entry));
  tag(nowPrice, playing ? color : INK, v.price(nowPrice));

  // the playhead
  if (playing && head > v.from && p < 1) {
    const hx = geo.X(head);
    const hy = geo.Y(nowPrice);
    g.setLineDash([8, 10]);
    g.strokeStyle = color;
    A(0.4);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(hx, y0 - 10);
    g.lineTo(hx, y1);
    g.moveTo(x0, hy);
    g.lineTo(px1, hy);
    g.stroke();
    g.setLineDash([]);
    A(1);
    font(g, f === 'portrait' ? 34 : 26, 500);
    g.fillStyle = MUTED;
    const right = hx > (x0 + px1) / 2;
    g.textAlign = right ? 'right' : 'left';
    g.fillText(v.date(head), hx + (right ? -16 : 16), y1 + (f === 'portrait' ? 60 : 46));
  }

  // the reveal
  if (r > 0) {
    A(1);
    g.fillStyle = `rgba(255,255,255,${0.95 * r})`;
    g.fillRect(0, L.headerY + 30, W, H - L.headerY - 30);
    drawReveal(g, v, L, r, time, T, alpha);
  }
  A(1);
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

function drawReveal(g: CanvasRenderingContext2D, v: ReplayVideo, L: Layout, r: number, time: number, T: Timing, alpha: number) {
  const { W, pad } = L;
  const R = L.reveal;
  const color = toneColor(v.pnl);
  const lift = (1 - r) * 40;
  const maxW = W - pad * 2;
  g.globalAlpha = alpha * r;
  g.textAlign = 'left';

  // the verdict, then the P&L, big
  fit(g, v.verdict, Math.round(R.big * 0.26), 600, maxW);
  g.fillStyle = INK2;
  g.fillText(v.verdict, pad, R.top + lift);
  const pnlY = R.top + R.big * 0.95 + lift;
  fit(g, v.pnlText, R.big, 700, maxW);
  g.fillStyle = color;
  g.fillText(v.pnlText, pad - 6, pnlY);
  const pw = g.measureText(v.pnlText).width;
  if (v.roiText) {
    const rs = Math.round(R.big * 0.25);
    font(g, rs, 650);
    const rw = g.measureText(v.roiText).width + rs * 0.9;
    const fits = pad + pw + 30 + rw <= W - pad;
    const rx = fits ? pad + pw + 30 : pad;
    const ry = fits ? pnlY - rs * 1.45 : pnlY + rs * 0.6;
    g.fillStyle = v.pnl > 0 ? '#ecfdf3' : v.pnl < 0 ? '#fef2f2' : SUBTLE;
    g.beginPath();
    g.roundRect(rx, ry, rw, rs * 1.6, rs * 0.3);
    g.fill();
    g.fillStyle = color;
    g.fillText(v.roiText, rx + rs * 0.45, ry + rs * 1.12);
  }

  // the rank pops in after the number
  const rk = easeBack((time - T.play - 0.55) / 0.4);
  if (rk > 0) {
    const s = Math.round(R.statSize * 0.95);
    g.save();
    g.translate(pad, R.rankY);
    g.globalAlpha = alpha * clamp01(rk);
    font(g, s, 700);
    const name = v.rank.name.toUpperCase();
    const nw = g.measureText(name).width + s * 1.3;
    g.fillStyle = INK;
    g.beginPath();
    g.roundRect(0, 0, nw, s * 2, s * 0.4);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillText(name, s * 0.65, s * 1.36);
    g.fillStyle = INK2;
    if (R.rankBelow) {
      fit(g, v.rank.line, s, 400, maxW);
      g.fillText(v.rank.line, 0, s * 3.5);
    } else {
      fit(g, v.rank.line, s, 400, maxW - nw - 30);
      g.fillText(v.rank.line, nw + 26, s * 1.36);
    }
    g.restore();
  }

  // the numbers
  const st = clamp01((time - T.play - 0.9) / 0.4);
  if (st > 0) {
    g.globalAlpha = alpha * st;
    const colW = (maxW - (R.cols - 1) * 40) / R.cols;
    v.stats.slice(0, 4).forEach((s, i) => {
      const x = pad + (i % R.cols) * (colW + 40);
      const y = R.statsY + Math.floor(i / R.cols) * R.rowH;
      font(g, R.statSize, 400);
      g.fillStyle = MUTED;
      g.textAlign = 'left';
      g.fillText(s.k, x, y);
      font(g, R.statSize, 650);
      g.fillStyle = INK;
      g.textAlign = 'right';
      g.fillText(s.v, x + colW, y);
      g.strokeStyle = LINE;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y + R.statSize * 0.7);
      g.lineTo(x + colW, y + R.statSize * 0.7);
      g.stroke();
    });
  }
  g.globalAlpha = alpha;
}

/** The sound track's cues: where each blip, tick and chord lands. */
export function soundCues(v: ReplayVideo, l: VideoLength): Cue[] {
  const T = LENGTHS[l];
  const geo = geometry(v, layout('square'));
  const cues: Cue[] = [{ t: 0.02, kind: 'hook' }];
  for (let t = T.hook; t < T.play; t += l === 'story' ? 0.16 : 0.11) {
    const head = v.from + (v.to - v.from) * playAt(t, l);
    cues.push({ t, kind: 'tick', pitch: geo.level(geo.at(head)) });
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
  const { seconds } = LENGTHS[l];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no canvas');
  await loadFonts();
  const frames = FPS * seconds;
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
  const { seconds } = LENGTHS[l];
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
