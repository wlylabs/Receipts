/** A paper trade placed on a token's real chart, kept in this browser. */
export interface PaperTrade {
  id: string;
  chain: string;
  address: string;
  symbol: string;
  image: string | null;
  usd: number;
  entryTs: number;
  entryPrice: number;
  /** Null while the position is still open. */
  exitTs: number | null;
  exitPrice: number | null;
  placedAt: number;
}

export const PAPER_KEY = 'receipts:paper';
export const MAX_PAPER = 50;

/** P&L in USD, marking an open position at `live`. */
export function paperPnl(t: PaperTrade, live?: number): number | null {
  const exit = t.exitPrice ?? live;
  if (!exit || !(t.entryPrice > 0)) return null;
  return t.usd * (exit / t.entryPrice - 1);
}
