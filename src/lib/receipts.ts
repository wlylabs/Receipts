import { CHAINS } from './chains';
import type { BoardRow, DsPair, GtTrade, Move, PositionCalc, TokenInfo, Trade, Window } from './types';

/* ---------- addresses ---------- */

export const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
/** Pools on some EVM dexes (Uniswap v4) are 32-byte ids rather than addresses. */
const POOL_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export const isAddress = (a: string) => SOL_RE.test(a) || EVM_RE.test(a) || POOL_ID_RE.test(a);
export const isWallet = (a: string) => SOL_RE.test(a) || EVM_RE.test(a);

/** People paste links and labels: take the first thing shaped like an address. */
export function cleanAddress(raw: string): string {
  const s = raw.trim();
  const evm = s.match(/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])|0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/);
  if (evm) return evm[0];
  const sol = s.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  return sol ? sol[0] : s;
}

/** EVM addresses ignore case; Solana's do not. */
export function sameAddress(a: string, b: string): boolean {
  return a.startsWith('0x') ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/* ---------- reading the feeds ---------- */

export function toTokenInfo(p: DsPair): TokenInfo {
  return {
    chain: p.chainId,
    chainName: CHAINS[p.chainId]?.name ?? p.chainId,
    address: p.baseToken.address,
    pair: p.pairAddress,
    dex: p.dexId,
    quoteSymbol: p.quoteToken.symbol,
    name: p.baseToken.name,
    symbol: p.baseToken.symbol,
    image: p.info?.imageUrl ?? null,
    priceUsd: Number(p.priceUsd ?? 0),
    mcapUsd: p.marketCap ?? p.fdv ?? null,
    liquidityUsd: p.liquidity?.usd ?? null,
    volume24hUsd: p.volume?.h24 ?? null,
    change24h: p.priceChange?.h24 ?? null,
    createdAt: p.pairCreatedAt ? Math.floor(p.pairCreatedAt / 1000) : null,
    url: p.url,
  };
}

/**
 * The pool to read a token from: the deepest one whose price agrees with the others. Pools with a
 * broken or gamed price can report millions in liquidity (one pair of an exotic quote token, its
 * value made up), so a pool priced far off the median of the token's pools is passed over.
 */
export function bestPair(pairs: readonly DsPair[]): DsPair | null {
  const priced = pairs.filter((p) => Number(p.priceUsd) > 0);
  const prices = priced.map((p) => Number(p.priceUsd)).sort((a, b) => a - b);
  const mid = prices.length ? prices[Math.floor((prices.length - 1) / 2)]! : 0;
  const sane = priced.filter((p) => Number(p.priceUsd) / mid < 3 && mid / Number(p.priceUsd) < 3);
  const pool = sane.length ? sane : pairs;
  return pool.reduce<DsPair | null>((a, p) => (!a || (p.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? p : a), null);
}

/** A pool's trades as buys and sells of `token`, oldest first. Swaps not touching it are dropped. */
export function toTrades(raw: readonly GtTrade[], token: string): Trade[] {
  const out: Trade[] = [];
  for (const { attributes: a } of raw) {
    const buy = sameAddress(a.to_token_address, token);
    const sell = sameAddress(a.from_token_address, token);
    if (buy === sell) continue;
    const tokens = Number(buy ? a.to_token_amount : a.from_token_amount);
    const usd = Number(a.volume_in_usd);
    const ts = Math.floor(Date.parse(a.block_timestamp) / 1000);
    if (!(tokens > 0) || !(usd >= 0) || !Number.isFinite(ts)) continue;
    out.push({ tx: a.tx_hash, ts, trader: a.tx_from_address, side: buy ? 'buy' : 'sell', tokens, usd, priceUsd: usd / tokens });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Candles (newest first, [ts, o, h, l, c, v]) as a close-price line oldest first, plus the top. */
export function toSeries(ohlcv: readonly number[][]): { series: [number, number][]; ath: { ts: number; priceUsd: number }; highs: [number, number][] } {
  const rows = ohlcv.filter((c) => c.length >= 5 && c[4]! > 0).sort((a, b) => a[0]! - b[0]!);
  let ath = { ts: 0, priceUsd: 0 };
  for (const c of rows) if (c[2]! > ath.priceUsd) ath = { ts: c[0]!, priceUsd: c[2]! };
  const series = rows.map((c): [number, number] => [c[0]!, c[4]!]);
  // put the top on the line so the chart's peak is the real one
  const k = series.findIndex(([ts]) => ts === ath.ts);
  if (k >= 0) series[k] = [ath.ts, ath.priceUsd];
  return { series, ath, highs: rows.map((c): [number, number] => [c[0]!, c[2]!]) };
}

/** The candle price at a time: the last close at or before it, or the live price after the chart ends. */
export function priceAt(series: readonly [number, number][], ts: number, live: number): number {
  if (series.length === 0) return live;
  if (ts > series.at(-1)![0] + 3600) return live;
  let lo = 0;
  let hi = series.length - 1;
  if (ts <= series[0]![0]) return series[0]![1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series[mid]![0] <= ts) lo = mid;
    else hi = mid - 1;
  }
  return series[lo]![1];
}

/** An exact price this far off the chart's is a misread (a multi-hop route, a bundle): the chart's is kept. */
const MAX_OFF = 10;

/**
 * Balance changes read off the chain as trades. A swap is valued at what really went the other
 * way (stablecoins at a dollar, the native coin at its price then), else at what the DEX feed
 * says the same transaction was worth, else at the chart's candle. A transfer is valued at the
 * candle: it is held at that cost and carries no profit.
 */
export function movesToTrades(
  moves: readonly Move[],
  owner: string,
  series: readonly [number, number][],
  live: number,
  opts: { nativeAt?: ((ts: number) => number | null) | null; feed?: ReadonlyMap<string, number> } = {},
): Trade[] {
  return moves.map((m) => {
    const tokens = Math.abs(m.delta);
    const chart = priceAt(series, m.ts, live);
    const nat = opts.nativeAt?.(m.ts) ?? null;
    const side = m.delta > 0 ? 'buy' : 'sell';
    const feeUsd = m.fee && nat ? m.fee * nat : 0;
    let usd = tokens * chart;
    let priced: Trade['priced'] = 'candle';
    if (m.kind === 'swap') {
      const native = Math.abs(m.native ?? 0);
      const paid = Math.abs(m.stable ?? 0) + (native > 1e-9 ? (nat === null ? NaN : native * nat) : 0);
      const fed = opts.feed?.get(m.tx);
      const fits = (v: number) => v > 0 && Number.isFinite(v) && (!(chart > 0) || (v / tokens < chart * MAX_OFF && v / tokens > chart / MAX_OFF));
      if (fits(paid)) [usd, priced] = [paid, 'exact'];
      else if (fed !== undefined && fits(fed)) [usd, priced] = [fed, 'exact'];
    }
    return { tx: m.tx, ts: m.ts, trader: owner, side, tokens, usd, priceUsd: tokens ? usd / tokens : chart, kind: m.kind, priced, ...(feeUsd ? { feeUsd } : {}) };
  });
}

/* ---------- the maths ---------- */

/** For any time, the highest price seen after it: what a seller could have had by holding on. */
export function peakAfter(highs: readonly [number, number][], trades: readonly Trade[]): (ts: number) => number {
  const points = [...highs, ...trades.map((t): [number, number] => [t.ts, t.priceUsd])].sort((a, b) => a[0] - b[0]);
  const suffix = new Array<number>(points.length + 1).fill(0);
  for (let i = points.length - 1; i >= 0; i--) suffix[i] = Math.max(suffix[i + 1]!, points[i]![1]);
  return (ts) => {
    let lo = 0;
    let hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid]![0] <= ts) lo = mid + 1;
      else hi = mid;
    }
    return suffix[lo]!;
  };
}

/**
 * A wallet's P&L on its trades, at the average cost of what it bought. Tokens received for
 * nothing join the bag at what they were worth then; tokens sent away leave it at cost, with no
 * profit; fees come off the P&L.
 */
export function position(trades: readonly Trade[], priceUsd: number, peak?: (ts: number) => number): PositionCalc {
  let usdIn = 0;
  let usdOut = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let buys = 0;
  let sells = 0;
  let missedUsd = 0;
  let received = 0;
  let receivedUsd = 0;
  let sent = 0;
  let feesUsd = 0;
  for (const t of trades) {
    feesUsd += t.feeUsd ?? 0;
    if (t.kind === 'transfer') {
      if (t.side === 'buy') {
        received += t.tokens;
        receivedUsd += t.usd;
      } else sent += t.tokens;
    } else if (t.side === 'buy') {
      buys++;
      usdIn += t.usd;
      tokensIn += t.tokens;
    } else {
      sells++;
      usdOut += t.usd;
      tokensOut += t.tokens;
      const top = peak?.(t.ts) ?? 0;
      if (top > t.priceUsd) missedUsd += t.tokens * (top - t.priceUsd);
    }
  }
  const held = tokensIn + received;
  const avgBuy = held > 0 ? (usdIn + receivedUsd) / held : 0;
  const avgSell = tokensOut > 0 ? usdOut / tokensOut : 0;
  const matched = Math.min(held, tokensOut);
  const gone = Math.min(sent, held - matched);
  const open = held - matched - gone;
  const realized = matched * (avgSell - avgBuy);
  const unrealized = open * (priceUsd - avgBuy);
  const pnl = realized + unrealized - feesUsd;
  const cost = usdIn + receivedUsd - gone * avgBuy;
  return {
    buys,
    sells,
    usdIn,
    usdOut,
    tokensIn,
    tokensOut,
    open,
    openValue: open * priceUsd,
    realized,
    unrealized,
    pnl,
    roi: cost > 0 && usdIn > 0 ? pnl / cost : null,
    unknownSold: tokensOut - matched,
    sent,
    received,
    feesUsd,
    missedUsd,
    firstTs: trades[0]?.ts ?? 0,
    lastTs: trades.at(-1)?.ts ?? 0,
  };
}

export function groupByTrader(trades: readonly Trade[]): Map<string, Trade[]> {
  const by = new Map<string, Trade[]>();
  for (const t of trades) {
    const key = t.trader.startsWith('0x') ? t.trader.toLowerCase() : t.trader;
    const list = by.get(key);
    if (list) list.push(t);
    else by.set(key, [t]);
  }
  return by;
}

/** The token's supply, to turn a price into a market cap; 0 when DexScreener has no market cap. */
export function supplyOf(token: Pick<TokenInfo, 'mcapUsd' | 'priceUsd'>): number {
  return token.mcapUsd && token.priceUsd > 0 ? token.mcapUsd / token.priceUsd : 0;
}

/** Every wallet in the window ranked by profit, best first. */
export function leaderboard(trades: readonly Trade[], priceUsd: number): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const [trader, list] of groupByTrader(trades)) {
    const p = position(list, priceUsd);
    rows.push({ trader, trades: list.length, usdIn: p.usdIn, usdOut: p.usdOut, pnl: p.pnl, roi: p.roi });
  }
  return rows.sort((a, b) => b.pnl - a.pnl);
}

export function windowOf(trades: readonly Trade[]): Window {
  const traders = new Set<string>();
  let buys = 0;
  let volumeUsd = 0;
  for (const t of trades) {
    traders.add(t.trader.toLowerCase());
    if (t.side === 'buy') buys++;
    volumeUsd += t.usd;
  }
  return { trades: trades.length, traders: traders.size, buys, sells: trades.length - buys, volumeUsd, from: trades[0]?.ts ?? 0, to: trades.at(-1)?.ts ?? 0 };
}

/* ---------- the game ---------- */

export type RankId = 'exit-liquidity' | 'bagholder' | 'paper-cut' | 'breakeven' | 'profit-taker' | 'chad' | 'oracle';

/** A title for a receipt, from its return on what was put in. */
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
  exit: number;
  /** USD in. */
  usd: number;
  /** Sell at this price when the exit is now, rather than the last candle. */
  nowPrice?: number;
  holdNow?: boolean;
}

export interface SimResult {
  ok: boolean;
  tokens: number;
  entryPrice: number;
  exitPrice: number;
  out: number;
  pnl: number;
  roi: number;
  bestOut: number;
  bestTs: number;
  /** P&L at each point from the entry to the exit, for the replay. */
  path: { ts: number; pnl: number }[];
}

/** A pretend trade on the token's real price line: buy at the entry candle, sell at the exit. */
export function simulate(i: SimInput): SimResult {
  const empty: SimResult = { ok: false, tokens: 0, entryPrice: 0, exitPrice: 0, out: 0, pnl: 0, roi: 0, bestOut: 0, bestTs: 0, path: [] };
  const a = i.series[i.entry];
  const b = i.series[i.exit];
  if (!a || !b || i.exit < i.entry || !(i.usd > 0) || !(a[1] > 0)) return empty;
  const tokens = i.usd / a[1];
  const exitPrice = i.holdNow && i.nowPrice ? i.nowPrice : b[1];
  const out = tokens * exitPrice;
  const path: SimResult['path'] = [];
  let bestOut = 0;
  let bestTs = a[0];
  for (let k = i.entry; k <= i.exit; k++) {
    const [ts, p] = i.series[k]!;
    const v = k === i.exit ? out : tokens * p;
    path.push({ ts, pnl: v - i.usd });
    if (v > bestOut) {
      bestOut = v;
      bestTs = ts;
    }
  }
  return { ok: true, tokens, entryPrice: a[1], exitPrice, out, pnl: out - i.usd, roi: (out - i.usd) / i.usd, bestOut, bestTs, path };
}

/** Where a P&L would land among the window's traders: 1 is the top. */
export function placement(pnl: number, board: readonly BoardRow[]): number {
  let ahead = 0;
  for (const r of board) if (r.pnl > pnl) ahead++;
  return ahead + 1;
}
