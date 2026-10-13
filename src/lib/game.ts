import type { RankId } from './receipts';

export const RANKS: Record<RankId, { name: string; line: string }> = {
  'exit-liquidity': { name: 'Exit Liquidity', line: 'Someone had to buy the top. Thank you for your service.' },
  bagholder: { name: 'Bagholder', line: 'Bought high, sold low, or never sold at all.' },
  'paper-cut': { name: 'Paper Cut', line: 'A small loss, mostly to fees.' },
  breakeven: { name: 'Breakeven', line: 'All that clicking for this.' },
  'profit-taker': { name: 'Profit Taker', line: 'Got in, got paid, got out.' },
  chad: { name: 'Chad', line: 'Multiplied the bag. Tell everyone.' },
  oracle: { name: 'Oracle', line: 'Saw it before the chart did.' },
};

export type Tone = 'pos' | 'neg' | null;

export const toneOf = (n: number, eps = 1e-9): Tone => (n > eps ? 'pos' : n < -eps ? 'neg' : null);

/** The stamp across a receipt. */
export function stampOf(pnl: number): { text: string; tone: Tone } {
  const t = toneOf(pnl, 1e-6);
  return t === 'pos' ? { text: 'PAID', tone: 'pos' } : t === 'neg' ? { text: 'REKT', tone: 'neg' } : { text: 'EVEN', tone: null };
}

export const KEYS = {
  recent: 'receipts:recent',
  /** How charts draw their candles. */
  chartStyle: 'receipts:chart-style',
  best: (mint: string) => `receipts:best:${mint}`,
};

export interface Recent {
  kind: 'trader' | 'token' | 'wallet';
  address: string;
  /** The token a trader's receipt was pulled on. */
  ca?: string;
  label: string;
  at: number;
}
