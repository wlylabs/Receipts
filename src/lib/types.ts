/** What bordrless.app's API sends, only the fields Receipts reads. */
export interface RawLaunch {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  status: 'curve' | 'graduated';
  createdAt: number;
  priceQuote: number | null;
  priceUsd: number | null;
  mcapUsd: number | null;
  holders: number;
  buyFeeBps: number;
  sellFeeBps: number;
  decimals?: number;
  quote?: { symbol: string; decimals: number };
}

export interface RawTrade {
  signature: string;
  slot: number;
  ts: number;
  trader: string;
  side: 'buy' | 'sell';
  baseAmount: string;
  quoteAmount: string;
  priceQuote: number;
  priceUsd: number;
}

export interface RawPortfolio {
  owner: string;
  lamports: string;
  entries: { mint: string; decimals: number; amount: string; kind: string; claimableRewards: string | null }[];
  created: { mint: string }[];
}

export interface RawRewards {
  owner: string;
  positions: { mint: string; decimals: number; balance: string; claimable: string; claimed: string }[];
}

/** A trade in plain numbers: tokens in whole tokens, SOL in SOL. */
export interface Trade {
  sig: string;
  ts: number;
  trader: string;
  side: 'buy' | 'sell';
  tokens: number;
  sol: number;
  priceSol: number;
}

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  status: 'curve' | 'graduated';
  createdAt: number;
  priceSol: number;
  priceUsd: number;
  mcapUsd: number | null;
  holders: number;
  buyFeeBps: number;
  sellFeeBps: number;
}

/** One trader's whole history on one token, in SOL. */
export interface PositionCalc {
  buys: number;
  sells: number;
  solIn: number;
  solOut: number;
  tokensIn: number;
  tokensOut: number;
  /** Tokens still held. */
  held: number;
  /** What selling the held tokens now would return, sell fee taken. */
  holdValue: number;
  /** SOL from sells above what those tokens cost on average. */
  realized: number;
  /** Holder rewards paid to this wallet, claimed or not. */
  rewards: number;
  /** Everything out plus the bag, less everything in. */
  pnl: number;
  /** pnl over SOL put in; null with nothing put in. */
  roi: number | null;
  /** What the sold tokens would have fetched at the highest price after each sell. */
  missedSol: number;
  firstTs: number;
  lastTs: number;
}

export interface BoardRow {
  trader: string;
  trades: number;
  solIn: number;
  solOut: number;
  holdValue: number;
  pnl: number;
  roi: number | null;
}

export interface TokenStats {
  trades: number;
  traders: number;
  buys: number;
  sells: number;
  volumeSol: number;
  firstTs: number;
  lastTs: number;
}

/** GET /api/token/[ca] */
export interface TokenReceipts {
  kind: 'token';
  token: TokenInfo;
  solUsd: number;
  /** False when the history was too long to read in full; the oldest trades are then missing. */
  complete: boolean;
  /** The price since launch as [unix seconds, SOL per token], oldest first. */
  series: [number, number][];
  ath: { ts: number; priceSol: number };
  stats: TokenStats;
  /** Every trader on this token, best first. */
  board: BoardRow[];
}

export interface Position extends PositionCalc {
  token: TokenInfo;
  /** This wallet's trades on the token, oldest first, as [ts, side, tokens, sol, priceSol, signature]. */
  trades: [number, 'buy' | 'sell', number, number, number, string][];
  athSol: number;
  /** The token's price since launch, thinned, as [unix seconds, SOL per token]. */
  series: [number, number][];
  complete: boolean;
}

export interface TraderTotals {
  solIn: number;
  solOut: number;
  holdValue: number;
  rewards: number;
  pnl: number;
  roi: number | null;
  trades: number;
  wins: number;
  losses: number;
  missedSol: number;
  firstTs: number;
  lastTs: number;
}

/** GET /api/trader/[address] */
export interface TraderReceipts {
  kind: 'trader';
  owner: string;
  solUsd: number;
  /** SOL in the wallet right now. */
  walletSol: number;
  positions: Position[];
  totals: TraderTotals;
  complete: boolean;
}

/** GET /api/trader/[address] when the address turned out to be a token. */
export interface IsToken {
  kind: 'is-token';
  mint: string;
}

export interface ApiError {
  error: string;
  code: 'invalid' | 'not-found' | 'no-trades' | 'upstream';
}
