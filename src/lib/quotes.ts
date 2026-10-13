import 'server-only';

/**
 * What the chain's native coin was worth over time, to put a USD value on a swap paid in it. Read
 * from Pyth's Benchmarks, its free keyless price history (TradingView format). The price at a time
 * is the close of the bar it falls in.
 */
const PYTH = process.env.PYTH_BENCHMARKS_URL ?? 'https://benchmarks.pyth.network/v1/shims/tradingview/history';

/** Pyth's symbol for each chain's native coin, by DexScreener chain id. */
export const NATIVE: Record<string, string> = {
  solana: 'Crypto.SOL/USD',
  ethereum: 'Crypto.ETH/USD',
  base: 'Crypto.ETH/USD',
  arbitrum: 'Crypto.ETH/USD',
  optimism: 'Crypto.ETH/USD',
  robinhood: 'Crypto.ETH/USD',
  bsc: 'Crypto.BNB/USD',
  avalanche: 'Crypto.AVAX/USD',
  polygon: 'Crypto.POL/USD',
};

interface Bars {
  s: string;
  t?: number[];
  c?: number[];
}

/** Bars from Pyth as [ts, close] oldest first; empty when it has none. */
export function toBars(body: Bars): [number, number][] {
  if (body.s !== 'ok' || !body.t || !body.c) return [];
  return body.t.map((t, i): [number, number] => [t, body.c![i]!]).filter(([, c]) => c > 0);
}

/** The close of the bar a time falls in, or the nearest bar's. */
export function closeAt(bars: readonly [number, number][], ts: number): number | null {
  if (!bars.length) return null;
  let lo = 0;
  let hi = bars.length - 1;
  if (ts <= bars[0]![0]) return bars[0]![1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid]![0] <= ts) lo = mid;
    else hi = mid - 1;
  }
  return bars[lo]![1];
}

/**
 * The native coin's USD price at any time from `from` to `to`, or null when Pyth has nothing (or
 * does not answer): the caller then prices from the chart instead.
 */
export async function nativeUsd(chain: string, from: number, to: number): Promise<((ts: number) => number | null) | null> {
  const symbol = NATIVE[chain];
  if (!symbol || !(to >= from)) return null;
  const span = to - from;
  // hourly bars up to a few months, daily beyond: one request either way
  const resolution = span <= 90 * 86_400 ? '60' : '1D';
  const pad = resolution === '60' ? 3600 : 86_400;
  const q = new URLSearchParams({ symbol, resolution, from: String(Math.floor(from - pad)), to: String(Math.ceil(to + pad)) });
  try {
    const res = await fetch(`${PYTH}?${q}`, { headers: { accept: 'application/json' }, next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const bars = toBars((await res.json()) as Bars);
    return bars.length ? (ts) => closeAt(bars, ts) : null;
  } catch {
    return null;
  }
}
