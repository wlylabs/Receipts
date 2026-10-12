import { barcode, type ReceiptDoc } from './receiptDoc';
import type { Tone } from './game';

const W = 1080;
const PAD = 84;
const PAPER = '#fbf8f1';
const INK = '#1b1a17';
const MUTED = '#6e6a60';
const LINE = '#d9d3c4';
const tone = (t: Tone | undefined) => (t === 'pos' ? '#0f7a43' : t === 'neg' ? '#b42318' : INK);
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

/**
 * Draws a receipt as a PNG on a 1080-wide card: the same lines as the page, on paper with torn
 * edges, the stamp across it, and the site under it.
 */
export async function receiptPng(doc: ReceiptDoc, site: string): Promise<Blob> {
  await Promise.all(['400', '700', '800'].map((w) => document.fonts.load(`${w} 30px 'JetBrains Mono'`).catch(() => undefined)));
  const heights = doc.lines.map((l) => (l.t === 'title' ? 70 : l.t === 'item' ? 84 : l.t === 'total' ? (l.sub ? 96 : 66) : l.t === 'rank' ? 170 : l.t === 'barcode' ? 130 : l.t === 'dash' ? 40 : l.t === 'space' ? 20 : 44));
  const paperH = heights.reduce((a, b) => a + b, 0) + 120;
  const H = Math.max(1350, paperH + 260);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#141414';
  g.fillRect(0, 0, W, H);
  // dot grid on the counter
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let x = 12; x < W; x += 30) for (let y = 12; y < H; y += 30) g.fillRect(x, y, 2, 2);

  const left = 90;
  const right = W - 90;
  const top = Math.round((H - paperH - 70) / 2);
  // paper with torn edges
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 50;
  g.shadowOffsetY = 20;
  g.fillStyle = PAPER;
  g.beginPath();
  const tooth = 18;
  g.moveTo(left, top);
  for (let x = left; x < right; x += tooth * 2) {
    g.lineTo(x + tooth, top - tooth);
    g.lineTo(Math.min(right, x + tooth * 2), top);
  }
  g.lineTo(right, top + paperH);
  for (let x = right; x > left; x -= tooth * 2) {
    g.lineTo(x - tooth, top + paperH + tooth);
    g.lineTo(Math.max(left, x - tooth * 2), top + paperH);
  }
  g.closePath();
  g.fill();
  g.restore();

  const x0 = left + PAD - 30;
  const x1 = right - PAD + 30;
  const mid = W / 2;
  let y = top + 60;
  const font = (size: number, weight = 400) => (g.font = `${weight} ${size}px ${MONO}`);
  const fit = (text: string, max: number) => {
    let t = text;
    while (t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -2) + '…';
    return t;
  };

  doc.lines.forEach((l, i) => {
    const h = heights[i]!;
    g.textBaseline = 'alphabetic';
    switch (l.t) {
      case 'title':
        font(46, 800);
        g.fillStyle = INK;
        g.textAlign = 'center';
        g.fillText(l.text.split('').join(' '), mid, y + 40);
        break;
      case 'center':
        font(26);
        g.fillStyle = l.muted ? MUTED : INK;
        g.textAlign = 'center';
        g.fillText(fit(l.text, x1 - x0), mid, y + 30);
        break;
      case 'row': {
        font(27);
        g.textAlign = 'right';
        g.fillStyle = tone(l.tone);
        g.fillText(l.right, x1, y + 30);
        const rw = g.measureText(l.right).width;
        g.textAlign = 'left';
        g.fillStyle = l.muted ? MUTED : INK;
        g.fillText(fit(l.left, x1 - x0 - rw - 24), x0, y + 30);
        break;
      }
      case 'item': {
        font(29, 700);
        g.textAlign = 'right';
        g.fillStyle = tone(l.tone);
        g.fillText(l.right, x1, y + 32);
        const rw = g.measureText(l.right).width;
        g.textAlign = 'left';
        g.fillStyle = INK;
        g.fillText(fit(l.name, x1 - x0 - rw - 24), x0, y + 32);
        font(22);
        g.fillStyle = MUTED;
        g.fillText(fit(l.sub, x1 - x0), x0, y + 66);
        break;
      }
      case 'dash':
        g.strokeStyle = LINE;
        g.lineWidth = 3;
        g.setLineDash([12, 9]);
        g.beginPath();
        g.moveTo(x0, y + 20);
        g.lineTo(x1, y + 20);
        g.stroke();
        g.setLineDash([]);
        break;
      case 'total':
        font(38, 800);
        g.textAlign = 'left';
        g.fillStyle = INK;
        g.fillText(l.left, x0, y + 46);
        g.textAlign = 'right';
        g.fillStyle = tone(l.tone);
        g.fillText(l.right, x1, y + 46);
        if (l.sub) {
          font(25);
          g.fillText(l.sub, x1, y + 82);
        }
        break;
      case 'rank':
        g.strokeStyle = INK;
        g.lineWidth = 5;
        g.strokeRect(x0, y + 10, x1 - x0, h - 26);
        g.textAlign = 'center';
        font(20);
        g.fillStyle = MUTED;
        g.fillText('R A N K', mid, y + 50);
        font(42, 800);
        g.fillStyle = INK;
        g.fillText(l.name.toUpperCase(), mid, y + 98);
        font(22);
        g.fillText(fit(l.line, x1 - x0 - 40), mid, y + 134);
        break;
      case 'barcode': {
        const bars = barcode(l.seed);
        const total = bars.reduce((a, b) => a + b * 3.4 + 4, 0);
        let bx = mid - total / 2;
        bars.forEach((w, k) => {
          if (k % 2 === 0) {
            g.fillStyle = INK;
            g.fillRect(bx, y + 20, w * 3.4, 92);
          }
          bx += w * 3.4 + 4;
        });
        break;
      }
      case 'space':
        break;
    }
    y += h;
  });

  // the stamp
  const s = doc.stamp;
  g.save();
  g.translate(right - 118, top + 52);
  g.rotate(-0.16);
  g.globalAlpha = 0.85;
  g.strokeStyle = g.fillStyle = s.tone === 'pos' ? '#0f7a43' : s.tone === 'neg' ? '#c0271a' : MUTED;
  font(52, 800);
  g.textAlign = 'center';
  const sw = g.measureText(s.text).width + 60;
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(-sw / 2, -50, sw, 70, 12);
  g.stroke();
  g.fillText(s.text, 0, 10);
  g.restore();

  font(26, 700);
  g.textAlign = 'center';
  g.fillStyle = '#ffd23f';
  g.fillText(`pull yours · ${site}`, mid, H - 70);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
}
