import type { Marker } from '../components/ReplayChart';

export interface CardData {
  kicker: string;
  symbol: string;
  chainName: string;
  pnl: string;
  roi: string | null;
  tone: 'pos' | 'neg' | null;
  rank: { name: string; line: string };
  stats: { k: string; v: string }[];
  series: readonly [number, number][];
  from: number;
  to: number;
  markers: Marker[];
  site: string;
}

const W = 1080;
const H = 1350;
const PAD = 72;
const INK = '#111113';
const MUTED = '#71717a';
const LINE = '#ebebee';
const SANS = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";
const toneColor = (t: CardData['tone']) => (t === 'pos' ? '#16a34a' : t === 'neg' ? '#dc2626' : INK);

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
  font(30, 500);
  g.fillStyle = MUTED;
  g.fillText(d.kicker, PAD, 120);
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
    g.fillStyle = d.tone === 'pos' ? '#ecfdf3' : d.tone === 'neg' ? '#fef2f2' : '#f7f7f8';
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
  const cy1 = 860;
  g.strokeStyle = LINE;
  g.lineWidth = 2;
  for (const f of [0.25, 0.5, 0.75]) {
    g.beginPath();
    g.moveTo(cx0, cy0 + (cy1 - cy0) * f);
    g.lineTo(cx1, cy0 + (cy1 - cy0) * f);
    g.stroke();
  }
  const s = d.series.filter(([, p]) => p > 0);
  if (s.length >= 2) {
    const t0 = s[0]![0];
    const t1 = Math.max(s.at(-1)![0], d.to);
    let lo = Infinity;
    let hi = 0;
    for (const [, p] of s) {
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
    }
    for (const m of d.markers) {
      if (m.price > 0 && m.ts >= t0) {
        lo = Math.min(lo, m.price);
        hi = Math.max(hi, m.price);
      }
    }
    const llo = Math.log(lo);
    const lhi = Math.log(hi === lo ? hi * 1.1 : hi);
    const X = (ts: number) => cx0 + ((ts - t0) / Math.max(1, t1 - t0)) * (cx1 - cx0);
    const Y = (p: number) => cy1 - ((Math.log(Math.max(p, lo)) - llo) / Math.max(1e-9, lhi - llo)) * (cy1 - cy0);
    const line = (pts: readonly [number, number][]) => {
      g.beginPath();
      pts.forEach(([ts, p], i) => (i ? g.lineTo(X(ts), Y(p)) : g.moveTo(X(ts), Y(p))));
    };
    g.lineJoin = 'round';
    g.lineCap = 'round';
    line(s);
    g.strokeStyle = 'rgba(17,17,19,0.22)';
    g.lineWidth = 3;
    g.stroke();
    const run = s.filter(([ts]) => ts >= d.from && ts <= d.to);
    if (run.length >= 2) {
      // a soft fill under the run
      line(run);
      g.lineTo(X(run.at(-1)![0]), cy1);
      g.lineTo(X(run[0]![0]), cy1);
      g.closePath();
      const grad = g.createLinearGradient(0, cy0, 0, cy1);
      grad.addColorStop(0, d.tone === 'pos' ? 'rgba(22,163,74,0.18)' : d.tone === 'neg' ? 'rgba(220,38,38,0.16)' : 'rgba(17,17,19,0.1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fill();
      line(run);
      g.strokeStyle = color;
      g.lineWidth = 6;
      g.stroke();
    }
    for (const m of d.markers) {
      if (m.ts < t0) continue;
      const mx = X(m.ts);
      const my = Y(Math.max(m.price, lo));
      g.fillStyle = m.kind === 'buy' ? '#16a34a' : '#dc2626';
      g.strokeStyle = '#ffffff';
      g.lineWidth = 5;
      g.beginPath();
      if (m.label) {
        font(24, 600);
        const lw = g.measureText(m.label).width + 28;
        g.roundRect(mx - lw / 2, my - 20, lw, 40, 20);
        g.fill();
        g.stroke();
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.fillText(m.label, mx, my + 8);
        g.textAlign = 'left';
      } else {
        g.arc(mx, my, 12, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
  }

  // the rank
  g.fillStyle = '#f7f7f8';
  g.beginPath();
  g.roundRect(PAD, 920, W - PAD * 2, 110, 20);
  g.fill();
  font(26, 600);
  const rank = d.rank.name.toUpperCase();
  const rw = g.measureText(rank).width + 36;
  g.fillStyle = INK;
  g.beginPath();
  g.roundRect(PAD + 24, 948, rw, 54, 12);
  g.fill();
  g.fillStyle = '#ffffff';
  g.fillText(rank, PAD + 42, 984);
  font(28, 400);
  g.fillStyle = '#3f3f46';
  let line = d.rank.line;
  while (line.length > 3 && g.measureText(line).width > W - PAD * 2 - rw - 72) line = line.slice(0, -2) + '…';
  g.fillText(line, PAD + rw + 48, 985);

  // the numbers
  d.stats.slice(0, 4).forEach((st, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = PAD + col * ((W - PAD * 2) / 2 + 12);
    const y = 1100 + row * 72;
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

  // the mark and the site
  g.textAlign = 'left';
  drawMark(g, PAD, H - 98, 40);
  font(32, 600);
  g.fillStyle = INK;
  g.fillText('receipts', PAD + 52, H - 66);
  font(26, 400);
  g.fillStyle = MUTED;
  g.textAlign = 'right';
  g.fillText(d.site, W - PAD, H - 66);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
}

/** The logo (a till roll unspooling into an r), scaled from its 24-unit box. */
function drawMark(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.fillStyle = INK;
  g.fill(new Path2D('M4.5 21.5V12c0-4.4 3.2-7.5 7.5-7.5h1.5v5.2H12c-1.4 0-2.3.9-2.3 2.3v9.5l-1.3-1.15-1.3 1.15-1.3-1.15z'));
  g.fill(new Path2D('M16.3 3a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2zm0 2.6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'), 'evenodd');
  g.restore();
}
