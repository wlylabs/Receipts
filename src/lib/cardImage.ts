import type { Marker } from '../components/ReplayChart';
import { X_LIGHT } from './palette';
import { candleAt, drawCandles, range, type Candle } from './candles';

export interface CardData {
  /** A small line above the ticker, e.g. a wallet's short address. */
  kicker?: string;
  symbol: string;
  chainName: string;
  pnl: string;
  roi: string | null;
  tone: 'pos' | 'neg' | null;
  rank: { name: string; line: string };
  stats: { k: string; v: string }[];
  candles: readonly Candle[];
  step: number;
  /** The average buy, drawn as a dashed line. */
  entry?: number;
  from: number;
  to: number;
  markers: Marker[];
}

const W = 1080;
const H = 1350;
const PAD = 72;
const { ink: INK, muted: MUTED, line: LINE, pos: POS, neg: NEG } = X_LIGHT;
const SANS = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";
const toneColor = (t: CardData['tone']) => (t === 'pos' ? POS : t === 'neg' ? NEG : INK);

/** The finished run as a 1080×1350 PNG: the P&L, the chart with the run drawn in, the rank. */
export async function cardPng(d: CardData): Promise<Blob> {
  await Promise.all(['400', '500', '600'].map((w) => document.fonts.load(`${w} 40px 'Inter Variable'`).catch(() => undefined)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const font = (size: number, weight = 400) => (g.font = `${weight} ${size}px ${SANS}`);
  const color = toneColor(d.tone);

  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);

  // header
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  if (d.kicker) {
    font(30, 500);
    g.fillStyle = MUTED;
    g.fillText(d.kicker, PAD, 120);
  }
  font(64, 600);
  g.fillStyle = INK;
  g.fillText(d.symbol, PAD, 196);
  const sw = g.measureText(d.symbol).width;
  font(30, 400);
  g.fillStyle = MUTED;
  g.fillText(d.chainName, PAD + sw + 20, 196);

  // the P&L
  font(132, 600);
  g.fillStyle = color;
  g.fillText(d.pnl, PAD - 4, 350);
  if (d.roi) {
    const pw = g.measureText(d.pnl).width;
    font(38, 600);
    const rw = g.measureText(d.roi).width + 36;
    const fits = PAD + pw + 24 + rw <= W - PAD;
    const rx = fits ? PAD + pw + 24 : PAD;
    const ry = fits ? 296 : 382;
    g.fillStyle = d.tone === 'pos' ? X_LIGHT.posWash : d.tone === 'neg' ? X_LIGHT.negWash : X_LIGHT.subtle;
    g.beginPath();
    g.roundRect(rx, ry, rw, 60, 12);
    g.fill();
    g.fillStyle = color;
    g.fillText(d.roi, rx + 18, ry + 43);
  }

  // the chart
  const cx0 = PAD;
  const cx1 = W - PAD;
  const cy0 = 470;
  const cy1 = 920;
  g.strokeStyle = LINE;
  g.lineWidth = 2;
  for (const f of [0.25, 0.5, 0.75]) {
    g.beginPath();
    g.moveTo(cx0, cy0 + (cy1 - cy0) * f);
    g.lineTo(cx1, cy0 + (cy1 - cy0) * f);
    g.stroke();
  }
  const k = d.candles;
  if (k.length >= 2) {
    const t0 = k[0]![0];
    const t1 = Math.max(k.at(-1)![0] + d.step, d.to);
    const { lo, hi } = range(k, [...d.markers.filter((m) => m.ts >= t0).map((m) => m.price), d.entry ?? 0]);
    const llo = Math.log(lo);
    const lhi = Math.log(hi);
    const X = (ts: number) => cx0 + ((ts - t0) / Math.max(1, t1 - t0)) * (cx1 - cx0);
    const Y = (p: number) => cy1 - ((Math.log(Math.max(p, lo)) - llo) / Math.max(1e-9, lhi - llo)) * (cy1 - cy0);
    // the run's stretch, shaded
    g.fillStyle = color;
    g.globalAlpha = 0.06;
    g.fillRect(X(d.from), cy0 - 16, X(d.to) - X(d.from), cy1 - cy0 + 32);
    g.globalAlpha = 1;
    if (d.entry && d.entry > 0) {
      g.setLineDash([12, 12]);
      g.strokeStyle = X_LIGHT.entry;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(cx0, Y(d.entry));
      g.lineTo(cx1, Y(d.entry));
      g.stroke();
      g.setLineDash([]);
    }
    drawCandles(g, k, d.step, X, Y, { up: POS, down: NEG, body: 0.68 });
    for (const m of d.markers) {
      if (m.ts < t0) continue;
      const c = candleAt(k, d.step, m.ts);
      const buy = m.kind === 'buy';
      const dir = buy ? 1 : -1;
      const mx = X(c ? c[0] + d.step / 2 : m.ts);
      const my = (buy ? Y(Math.min(c?.[3] ?? m.price, m.price)) : Y(Math.max(c?.[2] ?? m.price, m.price))) + dir * 10;
      g.fillStyle = buy ? POS : NEG;
      g.beginPath();
      g.moveTo(mx, my);
      g.lineTo(mx - 11, my + dir * 16);
      g.lineTo(mx + 11, my + dir * 16);
      g.closePath();
      g.fill();
      if (m.label) {
        font(22, 600);
        const lw = g.measureText(m.label).width + 22;
        const top = buy ? my + 20 : my - 20 - 36;
        g.beginPath();
        g.roundRect(mx - lw / 2, top, lw, 36, 9);
        g.fill();
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.fillText(m.label, mx, top + 26);
        g.textAlign = 'left';
      }
    }
  }

  // the rank
  g.fillStyle = X_LIGHT.subtle;
  g.beginPath();
  g.roundRect(PAD, 990, W - PAD * 2, 110, 20);
  g.fill();
  font(26, 600);
  const rank = d.rank.name.toUpperCase();
  const rw = g.measureText(rank).width + 36;
  g.fillStyle = INK;
  g.beginPath();
  g.roundRect(PAD + 24, 1018, rw, 54, 12);
  g.fill();
  g.fillStyle = '#ffffff';
  g.fillText(rank, PAD + 42, 1054);
  font(28, 400);
  g.fillStyle = X_LIGHT.ink2;
  let line = d.rank.line;
  while (line.length > 3 && g.measureText(line).width > W - PAD * 2 - rw - 72) line = line.slice(0, -2) + '…';
  g.fillText(line, PAD + rw + 48, 1055);

  // the numbers
  d.stats.slice(0, 4).forEach((st, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = PAD + col * ((W - PAD * 2) / 2 + 12);
    const y = 1180 + row * 72;
    const w = (W - PAD * 2) / 2 - 12;
    font(28, 400);
    g.fillStyle = MUTED;
    g.textAlign = 'left';
    g.fillText(st.k, x, y);
    font(28, 600);
    g.fillStyle = INK;
    g.textAlign = 'right';
    g.fillText(st.v, x + w, y);
    g.strokeStyle = LINE;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y + 22);
    g.lineTo(x + w, y + 22);
    g.stroke();
  });

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
}
