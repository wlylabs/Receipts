import type { Marker } from '../components/ReplayChart';

/**
 * A short video of one replay, drawn on a canvas and encoded in the browser: MP4 (H.264) through
 * Mediabunny and WebCodecs where the browser can, WebM otherwise, and MediaRecorder as the last
 * resort. Two sizes: 16:9 for YouTube and 1:1 for feeds. The beats:
 *
 *   0–1.2 s   the hook: "$100 in SEAN → ?", the question the viewer stays to see answered
 *   1.2–5.8 s the replay: the playhead runs the chart, the P&L counts, trades pop in
 *   5.8–7.6 s the reveal: the P&L, its rank and the numbers behind it
 *   7.6–9 s   the outro: the mark and where to play
 */

export type VideoFormat = 'landscape' | 'square';

export const FORMATS: Record<VideoFormat, { width: number; height: number; label: string; ratio: string }> = {
  landscape: { width: 1920, height: 1080, label: 'YouTube', ratio: '16:9' },
  square: { width: 1080, height: 1080, label: 'Square', ratio: '1:1' },
};

export const FPS = 30;
export const SECONDS = 9;
const HOOK_END = 1.2;
const PLAY_END = 5.8;
const REVEAL_END = 7.6;

export interface ReplayVideo {
  /** "PAPER TRADE" or "WALLET 9WzD…AWWM". */
  kicker: string;
  symbol: string;
  chainName: string;
  /** The opening question, two lines: e.g. ["$100 in SEAN", "at launch →"]. */
  hook: [string, string];
  series: readonly [number, number][];
  from: number;
  to: number;
  markers: Marker[];
  /** The P&L in USD with the playhead at a time. */
  pnlAt: (ts: number) => number;
  pnl: number;
  pnlText: string;
  roiText: string | null;
  rank: { name: string; line: string };
  stats: { k: string; v: string }[];
  site: string;
  /** Formats a running USD amount for the counter. */
  money: (n: number) => string;
  /** Formats a date for the playhead label. */
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

/** How far the playhead has run, 0 to 1, at a time in the video. */
export function playAt(time: number): number {
  return easeInOut((time - HOOK_END) / (PLAY_END - HOOK_END - 0.2));
}

/** How far the reveal covers the chart, 0 to 1. */
export function revealAt(time: number): number {
  return easeOut((time - PLAY_END) / 0.45);
}

/** How far the outro covers the frame, 0 to 1. */
export function outroAt(time: number): number {
  return easeOut((time - REVEAL_END) / 0.4);
}

const toneColor = (n: number) => (n > 1e-9 ? POS : n < -1e-9 ? NEG : INK);

interface Layout {
  W: number;
  H: number;
  pad: number;
  chart: { x0: number; x1: number; y0: number; y1: number };
  counter: { x: number; y: number; size: number; align: CanvasTextAlign };
  scale: number;
}

function layout(f: VideoFormat): Layout {
  const { width: W, height: H } = FORMATS[f];
  if (f === 'landscape') {
    return { W, H, pad: 96, chart: { x0: 96, x1: W - 96, y0: 290, y1: H - 160 }, counter: { x: W - 96, y: 196, size: 120, align: 'right' }, scale: 1 };
  }
  return { W, H, pad: 72, chart: { x0: 72, x1: W - 72, y0: 400, y1: H - 160 }, counter: { x: 72, y: 330, size: 116, align: 'left' }, scale: 1 };
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

function geometry(v: ReplayVideo, L: Layout) {
  const s = v.series.filter(([, p]) => p > 0);
  const t0 = s[0]?.[0] ?? v.from;
  const t1 = Math.max(s.at(-1)?.[0] ?? v.to, v.to);
  let lo = Infinity;
  let hi = 0;
  for (const [, p] of s) {
    lo = Math.min(lo, p);
    hi = Math.max(hi, p);
  }
  for (const m of v.markers) {
    if (m.price > 0 && m.ts >= t0) {
      lo = Math.min(lo, m.price);
      hi = Math.max(hi, m.price);
    }
  }
  if (!Number.isFinite(lo)) lo = hi = 1;
  const llo = Math.log(lo);
  const lhi = Math.log(hi === lo ? hi * 1.1 : hi);
  const { x0, x1, y0, y1 } = L.chart;
  const X = (ts: number) => x0 + ((ts - t0) / Math.max(1, t1 - t0)) * (x1 - x0);
  const Y = (p: number) => y1 - ((Math.log(Math.max(p, lo)) - llo) / Math.max(1e-9, lhi - llo)) * (y1 - y0);
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
  const points = (a: number, b: number): [number, number][] => {
    const out: [number, number][] = [[a, at(a)]];
    for (const p of s) if (p[0] > a && p[0] < b) out.push(p);
    out.push([b, at(b)]);
    return out;
  };
  return { s, t0, X, Y, at, points };
}

/** One frame of the video at `time` seconds. */
export function drawFrame(g: CanvasRenderingContext2D, time: number, v: ReplayVideo, f: VideoFormat) {
  const L = layout(f);
  const { W, H, pad } = L;
  const geo = geometry(v, L);
  const head = v.from + (v.to - v.from) * playAt(time);
  const running = time < HOOK_END ? 0 : v.pnlAt(head);
  const color = toneColor(time < HOOK_END ? 0 : running);

  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';

  // header
  g.textAlign = 'left';
  font(g, 30, 500);
  g.fillStyle = MUTED;
  g.fillText(v.kicker, pad, 112);
  font(g, 76, 650);
  g.fillStyle = INK;
  g.fillText(v.symbol, pad, 196);
  const sw = g.measureText(v.symbol).width;
  font(g, 32, 400);
  g.fillStyle = MUTED;
  g.fillText(v.chainName, pad + sw + 22, 196);

  // the counter
  if (time >= HOOK_END) {
    const fade = easeOut((time - HOOK_END) / 0.3) * (1 - revealAt(time));
    g.globalAlpha = fade;
    font(g, L.counter.size, 650);
    g.textAlign = L.counter.align;
    g.fillStyle = color;
    g.fillText(v.money(running), L.counter.x, L.counter.y);
    g.globalAlpha = 1;
  }

  // the chart
  const { x0, x1, y0, y1 } = L.chart;
  g.strokeStyle = LINE;
  g.lineWidth = 2;
  for (const k of [0.25, 0.5, 0.75]) {
    g.beginPath();
    g.moveTo(x0, y0 + (y1 - y0) * k);
    g.lineTo(x1, y0 + (y1 - y0) * k);
    g.stroke();
  }
  const path = (pts: readonly [number, number][]) => {
    g.beginPath();
    pts.forEach(([ts, p], i) => (i ? g.lineTo(geo.X(ts), geo.Y(p)) : g.moveTo(geo.X(ts), geo.Y(p))));
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (geo.s.length >= 2) {
    path(geo.s);
    g.strokeStyle = time < HOOK_END ? 'rgba(17,17,19,0.5)' : 'rgba(17,17,19,0.2)';
    g.lineWidth = 3.5;
    g.stroke();
  }
  if (time >= HOOK_END && head > v.from) {
    const run = geo.points(v.from, head);
    path(run);
    g.lineTo(geo.X(head), y1);
    g.lineTo(geo.X(v.from), y1);
    g.closePath();
    const grad = g.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, color === POS ? 'rgba(22,163,74,0.2)' : color === NEG ? 'rgba(220,38,38,0.18)' : 'rgba(17,17,19,0.1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fill();
    path(run);
    g.strokeStyle = color;
    g.lineWidth = 7;
    g.stroke();

    // markers pop as the playhead passes them
    for (const m of v.markers) {
      if (m.ts > head || m.ts < geo.t0) continue;
      const passed = v.from + (v.to - v.from) * playAt(time) - m.ts;
      const age = clamp01(passed / Math.max(1, (v.to - v.from) * 0.04));
      const k = easeBack(age);
      drawMarker(g, geo.X(m.ts), geo.Y(m.price), m, k);
    }

    // the playhead
    if (time < PLAY_END) {
      const hx = geo.X(head);
      const hy = geo.Y(geo.at(head));
      g.setLineDash([8, 10]);
      g.strokeStyle = color;
      g.globalAlpha = 0.4;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(hx, y0 - 10);
      g.lineTo(hx, y1);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 0.18 + 0.12 * Math.sin(time * 9);
      g.fillStyle = color;
      g.beginPath();
      g.arc(hx, hy, 34, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = color;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(hx, hy, 15, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      font(g, 26, 500);
      g.fillStyle = MUTED;
      g.textAlign = hx > (x0 + x1) / 2 ? 'right' : 'left';
      g.fillText(v.date(head), hx + (hx > (x0 + x1) / 2 ? -16 : 16), y1 + 44);
    }
  }

  // the hook
  if (time < HOOK_END + 0.3) {
    const a = 1 - easeOut((time - HOOK_END + 0.1) / 0.35);
    const pop = easeBack(time / 0.45);
    g.globalAlpha = a;
    g.fillStyle = 'rgba(255,255,255,0.72)';
    g.fillRect(x0 - 20, y0 - 20, x1 - x0 + 40, y1 - y0 + 40);
    g.save();
    g.translate(W / 2, (y0 + y1) / 2);
    g.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
    g.textAlign = 'center';
    const hs = f === 'landscape' ? 96 : 84;
    fit(g, v.hook[0], hs, 650, W - pad * 2);
    g.fillStyle = INK;
    g.fillText(v.hook[0], 0, -20);
    fit(g, `${v.hook[1]} ?`, hs, 650, W - pad * 2);
    g.fillStyle = MUTED;
    g.fillText(`${v.hook[1]} ?`, 0, f === 'landscape' ? 92 : 82);
    g.restore();
    g.globalAlpha = 1;
  }

  // the reveal
  const r = revealAt(time);
  if (r > 0) {
    g.fillStyle = `rgba(255,255,255,${0.94 * r})`;
    g.fillRect(0, 230, W, H - 230);
    drawReveal(g, v, L, r, time);
  }

  // footer
  g.globalAlpha = 1;
  drawMark(g, pad, H - 92, 44, INK);
  font(g, 34, 650);
  g.fillStyle = INK;
  g.textAlign = 'left';
  g.fillText('receipts', pad + 56, H - 58);
  font(g, 28, 400);
  g.fillStyle = MUTED;
  g.textAlign = 'right';
  g.fillText(v.site, W - pad, H - 58);

  // the outro
  const o = outroAt(time);
  if (o > 0) {
    g.fillStyle = `rgba(255,255,255,${o})`;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = o;
    const size = f === 'landscape' ? 150 : 170;
    drawMark(g, W / 2 - size / 2, H / 2 - size - 30, size, INK);
    font(g, f === 'landscape' ? 72 : 80, 650);
    g.textAlign = 'center';
    g.fillStyle = INK;
    g.fillText('receipts', W / 2, H / 2 + 70);
    font(g, f === 'landscape' ? 36 : 40, 400);
    g.fillStyle = MUTED;
    g.fillText(`Paste any token or wallet · ${v.site}`, W / 2, H / 2 + 140);
    g.globalAlpha = 1;
  }
}

function drawMarker(g: CanvasRenderingContext2D, x: number, y: number, m: Marker, k: number) {
  if (k <= 0) return;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.fillStyle = m.kind === 'buy' ? POS : NEG;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.beginPath();
  if (m.label) {
    font(g, 26, 650);
    const w = g.measureText(m.label).width + 32;
    g.roundRect(-w / 2, -22, w, 44, 22);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.fillText(m.label, 0, 9);
  } else {
    g.arc(0, 0, 13, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    font(g, 16, 700);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.fillText(m.kind === 'buy' ? 'B' : 'S', 0, 6);
  }
  g.restore();
}

function drawReveal(g: CanvasRenderingContext2D, v: ReplayVideo, L: Layout, r: number, time: number) {
  const { W, pad } = L;
  const color = toneColor(v.pnl);
  const landscape = W > L.H;
  const top = landscape ? 300 : 300;
  const lift = (1 - r) * 40;
  g.globalAlpha = r;
  g.textAlign = 'left';

  // the P&L, big
  const big = landscape ? 190 : 170;
  fit(g, v.pnlText, big, 700, W - pad * 2);
  g.fillStyle = color;
  g.fillText(v.pnlText, pad - 6, top + big * 0.82 + lift);
  const pw = g.measureText(v.pnlText).width;
  if (v.roiText) {
    font(g, 46, 650);
    const rw = g.measureText(v.roiText).width + 40;
    const fits = pad + pw + 30 + rw <= W - pad;
    const rx = fits ? pad + pw + 30 : pad;
    const ry = fits ? top + big * 0.82 - 66 + lift : top + big + 10 + lift;
    g.fillStyle = v.pnl > 0 ? '#ecfdf3' : v.pnl < 0 ? '#fef2f2' : SUBTLE;
    g.beginPath();
    g.roundRect(rx, ry, rw, 72, 14);
    g.fill();
    g.fillStyle = color;
    g.fillText(v.roiText, rx + 20, ry + 51);
  }

  // the rank pops in after the number
  const rk = easeBack((time - PLAY_END - 0.35) / 0.4);
  if (rk > 0) {
    const ry = landscape ? top + 260 : top + 200;
    g.save();
    g.translate(pad, ry);
    g.globalAlpha = clamp01(rk);
    font(g, 34, 700);
    const name = v.rank.name.toUpperCase();
    const nw = g.measureText(name).width + 44;
    g.fillStyle = INK;
    g.beginPath();
    g.roundRect(0, 0, nw, 68, 14);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillText(name, 22, 46);
    font(g, 34, 400);
    g.fillStyle = INK2;
    if (landscape) g.fillText(v.rank.line, nw + 26, 46);
    else {
      fit(g, v.rank.line, 34, 400, W - pad * 2);
      g.fillText(v.rank.line, 0, 118);
    }
    g.restore();
  }

  // the numbers
  const st = clamp01((time - PLAY_END - 0.7) / 0.4);
  if (st > 0) {
    g.globalAlpha = st;
    const cols = landscape ? 2 : 1;
    const y0 = landscape ? top + 420 : top + 400;
    const colW = (W - pad * 2 - (cols - 1) * 40) / cols;
    v.stats.slice(0, 4).forEach((s, i) => {
      const x = pad + (i % cols) * (colW + 40);
      const y = y0 + Math.floor(i / cols) * (landscape ? 76 : 70);
      font(g, 32, 400);
      g.fillStyle = MUTED;
      g.textAlign = 'left';
      g.fillText(s.k, x, y);
      font(g, 32, 650);
      g.fillStyle = INK;
      g.textAlign = 'right';
      g.fillText(s.v, x + colW, y);
      g.strokeStyle = LINE;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y + 24);
      g.lineTo(x + colW, y + 24);
      g.stroke();
    });
  }
  g.globalAlpha = 1;
}

/** The logo (a till roll unspooling into an r), scaled from its 24-unit box. */
function drawMark(g: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.fillStyle = color;
  g.fill(new Path2D('M4.5 21.5V12c0-4.4 3.2-7.5 7.5-7.5h1.5v5.2H12c-1.4 0-2.3.9-2.3 2.3v9.5l-1.3-1.15-1.3 1.15-1.3-1.15z'));
  g.fill(new Path2D('M16.3 3a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2zm0 2.6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'), 'evenodd');
  g.restore();
}

export interface RenderedVideo {
  blob: Blob;
  extension: 'mp4' | 'webm';
}

async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(['400', '500', '650', '700'].map((w) => document.fonts.load(`${w} 60px 'Inter Variable'`))).catch(() => undefined);
}

export async function renderReplayVideo(v: ReplayVideo, f: VideoFormat, onProgress: (p: number) => void = () => {}): Promise<RenderedVideo> {
  const { width, height } = FORMATS[f];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no canvas');
  await loadFonts();
  const frames = FPS * SECONDS;

  const mb = await import('mediabunny').catch(() => null);
  if (mb && typeof VideoEncoder !== 'undefined') {
    // MP4 with H.264 plays everywhere, so it comes first; VP9 or VP8 in WebM where H.264 cannot be encoded
    const choices = [
      { codec: 'avc' as const, extension: 'mp4' as const },
      { codec: 'vp9' as const, extension: 'webm' as const },
      { codec: 'vp8' as const, extension: 'webm' as const },
    ];
    for (const choice of choices) {
      if (!(await mb.canEncodeVideo(choice.codec, { width, height }).catch(() => false))) continue;
      const target = new mb.BufferTarget();
      const format = choice.extension === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat();
      const output = new mb.Output({ format, target });
      const source = new mb.CanvasSource(canvas, { codec: choice.codec, bitrate: new mb.Quality('high'), keyFrameInterval: 2 });
      output.addVideoTrack(source, { frameRate: FPS });
      await output.start();
      for (let i = 0; i < frames; i++) {
        drawFrame(g, i / FPS, v, f);
        await source.add(i / FPS, 1 / FPS);
        onProgress((i + 1) / frames);
      }
      await output.finalize();
      if (!target.buffer) throw new Error('empty video');
      return { blob: new Blob([target.buffer], { type: format.mimeType }), extension: choice.extension };
    }
  }
  return recordInRealTime(canvas, g, v, f, onProgress);
}

/** The fallback: plays the video once on the canvas while MediaRecorder captures it. */
async function recordInRealTime(canvas: HTMLCanvasElement, g: CanvasRenderingContext2D, v: ReplayVideo, f: VideoFormat, onProgress: (p: number) => void): Promise<RenderedVideo> {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) throw new Error('no video support');
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!type) throw new Error('no video support');
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  drawFrame(g, 0, v, f);
  recorder.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const time = (performance.now() - start) / 1000;
      drawFrame(g, Math.min(time, SECONDS - 1 / FPS), v, f);
      onProgress(Math.min(1, time / SECONDS));
      if (time >= SECONDS) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  await stopped;
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), extension: type.startsWith('video/mp4') ? 'mp4' : 'webm' };
}
