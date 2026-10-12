/** A DexScreener pair, only the fields Receipts reads. */
export interface DsPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

/** A GeckoTerminal trade, only the fields Receipts reads. */
export interface GtTrade {
  attributes: {
    tx_hash: string;
    tx_from_address: string;
    block_timestamp: string;
    from_token_address: string;
    to_token_address: string;
    from_token_amount: string;
    to_token_amount: string;
    volume_in_usd: string;
  };
}

/** A trade in plain numbers: tokens in whole tokens, value in USD. */
export interface Trade {
  tx: string;
  ts: number;
  trader: string;
  side: 'buy' | 'sell';
  tokens: number;
  usd: number;
  priceUsd: number;
}

export interface TokenInfo {
  /** DexScreener's chain id, e.g. "solana", "ethereum", "base". */
  chain: string;
  chainName: string;
  address: string;
  /** The pool the chart and trades come from: the token's deepest pair. */
  pair: string;
  dex: string;
  quoteSymbol: string;
  name: string;
  symbol: string;
  image: string | null;
  priceUsd: number;
  mcapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  change24h: number | null;
  /** Unix seconds; null when DexScreener does not know. */
  createdAt: number | null;
  url: string;
}

/**
 * One wallet's trades on one token inside the window the trade feed covers. Tokens it sold that
 * it did not buy inside the window cost an unknown amount, so they are counted apart and left
 * out of the P&L.
 */
export interface PositionCalc {
  buys: number;
  sells: number;
  usdIn: number;
  usdOut: number;
  tokensIn: number;
  tokensOut: number;
  /** Tokens bought in the window and not sold since. */
  open: number;
  /** What the open tokens are worth now. */
  openValue: number;
  /** Profit on tokens both bought and sold in the window. */
  realized: number;
  /** Profit on the open tokens at today's price. */
  unrealized: number;
  pnl: number;
  /** pnl over USD put in; null with no buys seen. */
  roi: number | null;
  /** Tokens sold that were bought before the window. */
  unknownSold: number;
  /** What the tokens sold would have fetched at the highest price after each sell. */
  missedUsd: number;
  firstTs: number;
  lastTs: number;
}

export interface BoardRow {
  trader: string;
  trades: number;
  usdIn: number;
  usdOut: number;
  pnl: number;
  roi: number | null;
}

export interface Window {
  trades: number;
  traders: number;
  buys: number;
  sells: number;
  volumeUsd: number;
  from: number;
  to: number;
}

/** GET /api/token/[ca] */
export interface TokenReceipts {
  kind: 'token';
  token: TokenInfo;
  /** Price since the pair opened as [unix seconds, USD per token], oldest first. */
  series: [number, number][];
  /** Candle size of the series, e.g. "5m", "1h", "1d". */
  candle: string;
  ath: { ts: number; priceUsd: number };
  /** The latest trades the feed has, at most a few hundred within a day. */
  window: Window;
  /** Every wallet in that window, best first. */
  board: BoardRow[];
}

/** GET /api/trader/[address]?ca= */
export interface TraderReceipts {
  kind: 'trader';
  owner: string;
  token: TokenInfo;
  position: PositionCalc;
  /** The wallet's trades, oldest first, as [ts, side, tokens, usd, priceUsd, tx]. */
  trades: [number, 'buy' | 'sell', number, number, number, string][];
  series: [number, number][];
  candle: string;
  window: Window;
  /** Where this wallet ranks among the window's traders, 1 is the top. */
  place: number;
  of: number;
  /**
   * Where the trades came from: the chain itself (every transfer of the token in or out of the
   * wallet, so gifts count too) or the DEX feed's latest trades.
   */
  source: 'chain' | 'feed';
  /** False when the history goes back further than was read. */
  complete: boolean;
}

export interface Holding {
  token: TokenInfo;
  amount: number;
  valueUsd: number;
}

/** GET /api/wallet/[address] */
export interface WalletHoldings {
  kind: 'wallet';
  owner: string;
  holdings: Holding[];
}

/** GET /api/resolve/[address] */
export interface Resolved {
  kind: 'token' | 'wallet';
  address: string;
}

export interface ApiError {
  error: string;
  code: 'invalid' | 'not-found' | 'no-trades' | 'unsupported' | 'upstream';
}
