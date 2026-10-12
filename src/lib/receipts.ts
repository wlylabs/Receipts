import type { BoardRow, PositionCalc, RawLaunch, RawTrade, TokenInfo, TokenStats, Trade } from './types';

/** Solana addresses (wallets and mints) are base58 public keys. */
export const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function cleanAddress(raw: string): string {
  // people paste links and labels: take the first thing shaped like an address
  const m = raw.trim().match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return m ? m[0] : raw.trim();
}

const SOL_DECIMALS = 9;
const DEFAULT_TOKEN_DECIMALS = 6;

export function toTrade(t: RawTrade, tokenDecimals = DEFAULT_TOKEN_DECIMALS): Trade {
  return {
    sig: t.signature,
    ts: t.ts,
    trader: t.trader,
    side: t.side,
    tokens: Number(t.baseAmount) / 10 ** tokenDecimals,
    sol: Number(t.quoteAmount) / 10 ** SOL_DECIMALS,
    priceSol: t.priceQuote,
  };
}

export function toTokenInfo(l: RawLaunch, solUsd: number): TokenInfo {
  const priceSol = l.priceQuote ?? (l.priceUsd && solUsd ? l.priceUsd / solUsd : 0);
  return {
    mint: l.mint,
    name: l.name,
    symbol: l.symbol,
    image: l.image,
    status: l.status,
    createdAt: l.createdAt,
    priceSol,
    priceUsd: l.priceUsd ?? priceSol * solUsd,
    mcapUsd: l.mcapUsd,
    holders: l.holders,
    buyFeeBps: l.buyFeeBps,
    sellFeeBps: l.sellFeeBps,
  };
}

export const afterFee = (amount: number, bps: number) => amount * (1 - bps / 10_000);

/**
 * For each trade, the highest price any later trade paid: what a seller could have had by
 * holding on. `trades` oldest first.
 */
export function peaksAfter(trades: readonly Trade[]): Map<string, number> {
  const out = new Map<string, number>();
  let peak = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    const t = trades[i]!;
    out.set(t.sig, peak);
    if (t.priceSol > peak) peak = t.priceSol;
  }
  return out;
}

export interface PositionOpts {
  /** The token's price now, SOL per token. */
  priceSol: number;
  sellFeeBps: number;
  /** Tokens the wallet holds now; without it, what it bought less what it sold. */
  balance?: number;
  rewards?: number;
  peaks?: Map<string, number>;
}

/** One trader's receipt on one token, from its trades oldest first. */
export function position(trades: readonly Trade[], o: PositionOpts): PositionCalc {
  let solIn = 0;
  let solOut = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let buys = 0;
  let sells = 0;
  let missedSol = 0;
  for (const t of trades) {
    if (t.side === 'buy') {
      buys++;
      solIn += t.sol;
      tokensIn += t.tokens;
    } else {
      sells++;
      solOut += t.sol;
      tokensOut += t.tokens;
      const peak = o.peaks?.get(t.sig) ?? 0;
      if (peak > t.priceSol) missedSol += afterFee(t.tokens * peak, o.sellFeeBps) - t.sol;
    }
  }
  const bought = Math.max(0, tokensIn - tokensOut);
  // tokens that arrived by transfer cost nothing here; count only the bag the trades explain
  const held = o.balance === undefined ? bought : Math.min(Math.max(0, o.balance), bought);
  const holdValue = afterFee(held * o.priceSol, o.sellFeeBps);
  const avgCost = tokensIn > 0 ? solIn / tokensIn : 0;
  const realized = solOut - Math.min(tokensOut, tokensIn) * avgCost;
  const rewards = o.rewards ?? 0;
  const pnl = solOut + holdValue + rewards - solIn;
  return {
    buys,
    sells,
    solIn,
    solOut,
    tokensIn,
    tokensOut,
    held,
    holdValue,
    realized,
    rewards,
    pnl,
    roi: solIn > 0 ? pnl / solIn : null,
    missedSol: Math.max(0, missedSol),
    firstTs: trades[0]?.ts ?? 0,
    lastTs: trades.at(-1)?.ts ?? 0,
  };
}

export function groupByTrader(trades: readonly Trade[]): Map<string, Trade[]> {
  const by = new Map<string, Trade[]>();
  for (const t of trades) {
    const list = by.get(t.trader);
    if (list) list.push(t);
    else by.set(t.trader, [t]);
  }
  return by;
}

/** Every trader on a token ranked by profit, best first. */
export function leaderboard(trades: readonly Trade[], priceSol: number, sellFeeBps: number): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const [trader, list] of groupByTrader(trades)) {
    const p = position(list, { priceSol, sellFeeBps });
    rows.push({ trader, trades: list.length, solIn: p.solIn, solOut: p.solOut, holdValue: p.holdValue, pnl: p.pnl, roi: p.roi });
  }
  return rows.sort((a, b) => b.pnl - a.pnl);
}

export function tokenStats(trades: readonly Trade[]): TokenStats {
  const traders = new Set<string>();
  let buys = 0;
  let volumeSol = 0;
  for (const t of trades) {
    traders.add(t.trader);
    if (t.side === 'buy') buys++;
    volumeSol += t.sol;
  }
  return {
    trades: trades.length,
    traders: traders.size,
    buys,
    sells: trades.length - buys,
    volumeSol,
    firstTs: trades[0]?.ts ?? 0,
    lastTs: trades.at(-1)?.ts ?? 0,
  };
}

/**
 * The price line since launch in at most `n` points: one per time bucket, keeping each bucket's
 * last price, plus the all-time high so the chart never loses the top.
 */
export function priceSeries(trades: readonly Trade[], n = 480): [number, number][] {
  const pts = trades.filter((t) => t.priceSol > 0);
  if (pts.length === 0) return [];
  if (pts.length <= n) return pts.map((t) => [t.ts, t.priceSol]);
  const t0 = pts[0]!.ts;
  const span = Math.max(1, pts.at(-1)!.ts - t0);
  const buckets = new Map<number, [number, number]>();
  let ath = pts[0]!;
  for (const t of pts) {
    buckets.set(Math.min(n - 1, Math.floor(((t.ts - t0) / span) * n)), [t.ts, t.priceSol]);
    if (t.priceSol > ath.priceSol) ath = t;
  }
  const out = [...buckets.values()];
  if (!out.some(([, p]) => p === ath.priceSol)) out.push([ath.ts, ath.priceSol]);
  out.unshift([pts[0]!.ts, pts[0]!.priceSol]);
  return dedupe(out.sort((a, b) => a[0] - b[0]));
}

function dedupe(s: [number, number][]): [number, number][] {
  return s.filter((p, i) => i === 0 || p[0] !== s[i - 1]![0] || p[1] !== s[i - 1]![1]);
}

export function athOf(trades: readonly Trade[]): { ts: number; priceSol: number } {
  let best = { ts: 0, priceSol: 0 };
  for (const t of trades) if (t.priceSol > best.priceSol) best = { ts: t.ts, priceSol: t.priceSol };
  return best;
}

/* ---------- the game ---------- */

export type RankId = 'exit-liquidity' | 'bagholder' | 'paper-cut' | 'breakeven' | 'profit-taker' | 'chad' | 'oracle';

/** A title for a receipt, from its return on the SOL put in. */
export function rankOf(roi: number | null): RankId {
  const r = roi ?? 0;
  if (r <= -0.75) return 'exit-liquidity';
  if (r <= -0.25) return 'bagholder';
  if (r < -0.02) return 'paper-cut';
  if (r <= 0.05) return 'breakeven';
  if (r < 1) return 'profit-taker';
  if (r < 5) return 'chad';
  return 'oracle';
}

export interface SimInput {
  series: readonly [number, number][];
  entry: number;
  /** Index into `series`; the last point is "still holding now" when `holdNow`. */
  exit: number;
  sol: number;
  buyFeeBps: number;
  sellFeeBps: number;
  /** Price to sell at when the exit is now, rather than the last trade. */
  nowPriceSol?: number;
  holdNow?: boolean;
}

export interface SimResult {
  ok: boolean;
  tokens: number;
  entryPrice: number;
  exitPrice: number;
  out: number;
  fees: number;
  pnl: number;
  roi: number;
  /** The best exit after the entry, and what it would have returned. */
  bestOut: number;
  bestTs: number;
  /** P&L in SOL at each point from the entry to the exit, for the replay. */
  path: { ts: number; pnl: number; priceSol: number }[];
}

/**
 * A pretend trade on a token's real price line: buy `sol` at the entry, sell at the exit. The
 * token's own buy and sell fees apply; the price is the one real traders paid, without the
 * extra slippage a bag this size would add.
 */
export function simulate(i: SimInput): SimResult {
  const empty: SimResult = { ok: false, tokens: 0, entryPrice: 0, exitPrice: 0, out: 0, fees: 0, pnl: 0, roi: 0, bestOut: 0, bestTs: 0, path: [] };
  const a = i.series[i.entry];
  const b = i.series[i.exit];
  if (!a || !b || i.exit < i.entry || !(i.sol > 0) || !(a[1] > 0)) return empty;
  const tokens = afterFee(i.sol, i.buyFeeBps) / a[1];
  const exitPrice = i.holdNow && i.nowPriceSol ? i.nowPriceSol : b[1];
  const sellAt = (p: number) => afterFee(tokens * p, i.sellFeeBps);
  const out = sellAt(exitPrice);
  const path: SimResult['path'] = [];
  let bestOut = 0;
  let bestTs = a[0];
  for (let k = i.entry; k <= i.exit; k++) {
    const [ts, p] = i.series[k]!;
    const v = sellAt(p);
    path.push({ ts, pnl: v - i.sol, priceSol: p });
    if (v > bestOut) {
      bestOut = v;
      bestTs = ts;
    }
  }
  return {
    ok: true,
    tokens,
    entryPrice: a[1],
    exitPrice,
    out,
    fees: i.sol - afterFee(i.sol, i.buyFeeBps) + (tokens * exitPrice - out),
    pnl: out - i.sol,
    roi: (out - i.sol) / i.sol,
    bestOut,
    bestTs,
    path,
  };
}

/** Where a P&L would land among a token's real traders: 1 is the top. */
export function placement(pnl: number, board: readonly BoardRow[]): number {
  let ahead = 0;
  for (const r of board) if (r.pnl > pnl) ahead++;
  return ahead + 1;
}

/** Index of the point closest to a timestamp. */
export function indexAt(series: readonly [number, number][], ts: number): number {
  let best = 0;
  for (let k = 0; k < series.length; k++) if (Math.abs(series[k]![0] - ts) < Math.abs(series[best]![0] - ts)) best = k;
  return best;
}
