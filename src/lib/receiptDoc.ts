import type { Tone } from './game';

/** One printed line of a receipt; the page and the saved image both draw from these. */
export type Line =
  | { t: 'title'; text: string }
  | { t: 'center'; text: string; muted?: boolean }
  | { t: 'row'; left: string; right: string; tone?: Tone; muted?: boolean }
  | { t: 'item'; name: string; sub: string; right: string; tone?: Tone }
  | { t: 'dash' }
  | { t: 'total'; left: string; right: string; sub?: string; tone: Tone }
  | { t: 'rank'; name: string; line: string }
  | { t: 'barcode'; seed: string }
  | { t: 'space' };

export interface ReceiptDoc {
  lines: Line[];
  stamp: { text: string; tone: Tone };
}

/** Bar widths (1 to 3) for a barcode, the same every time for the same seed. */
export function barcode(seed: string, bars = 54): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    out.push(1 + ((h >>> 0) % 3));
  }
  return out;
}
