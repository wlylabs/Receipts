import 'server-only';
import { CHAINS } from './chains';
import { sameAddress } from './receipts';
import type { DsPair, GtTrade } from './types';

/**
 * DexScreener says what a token is and where it trades; GeckoTerminal has the pool's candles and
 * latest trades. Both are public and free, so every answer is cached for a minute: a busy page
 * costs each of them one request a minute per URL (GeckoTerminal allows about 30 a minute).
 */
const DS = 'https://api.dexscreener.com';
const GT = process.env.GECKOTERMINAL_API ?? 'https://api.geckoterminal.com/api/v2';
const TTL = 60;

export class NotFound extends Error {}

async function get<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Receipts (+https://github.com/wlylabs/receipts)', ...headers },
    next: { revalidate: TTL },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new NotFound(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

const gt = <T>(path: string) => get<T>(`${GT}/${path}`, { accept: 'application/json;version=20230302' });

/**
 * The token's deepest pool on a chain Receipts plays, or null. The address may also be a pair
 * (people paste dexscreener.com links), which the search finds.
 */
export async function findPair(address: string): Promise<{ pair: DsPair; tokenAddress: string } | null> {
  const byToken = (await get<{ pairs: DsPair[] | null }>(`${DS}/latest/dex/tokens/${address}`)).pairs ?? [];
  const asBase = byToken.filter((p) => CHAINS[p.chainId] && sameAddress(p.baseToken.address, address));
  let best = deepest(asBase);
  if (!best) {
    const found = (await get<{ pairs: DsPair[] | null }>(`${DS}/latest/dex/search?q=${encodeURIComponent(address)}`)).pairs ?? [];
    best = deepest(found.filter((p) => CHAINS[p.chainId] && sameAddress(p.pairAddress, address)));
  }
  return best ? { pair: best, tokenAddress: best.baseToken.address } : null;
}

function deepest(pairs: DsPair[]): DsPair | null {
  return pairs.reduce<DsPair | null>((a, p) => (!a || (p.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? p : a), null);
}

/** Whether the address has pairs on chains Receipts does not play. */
export async function onOtherChain(address: string): Promise<string | null> {
  const pairs = (await get<{ pairs: DsPair[] | null }>(`${DS}/latest/dex/tokens/${address}`)).pairs ?? [];
  return pairs.find((p) => !CHAINS[p.chainId])?.chainId ?? null;
}

export type Timeframe = { tf: 'minute' | 'hour' | 'day'; agg: number; label: string; sec: number };

/** A candle size that fits the pair's whole life into one page of 1,000 candles. */
export function timeframeFor(ageSec: number): Timeframe {
  const options: Timeframe[] = [
    { tf: 'minute', agg: 1, label: '1m', sec: 60 },
    { tf: 'minute', agg: 5, label: '5m', sec: 300 },
    { tf: 'minute', agg: 15, label: '15m', sec: 900 },
    { tf: 'hour', agg: 1, label: '1h', sec: 3600 },
    { tf: 'hour', agg: 4, label: '4h', sec: 14_400 },
    { tf: 'hour', agg: 12, label: '12h', sec: 43_200 },
  ];
  return options.find((o) => ageSec / o.sec <= 900) ?? { tf: 'day', agg: 1, label: '1d', sec: 86_400 };
}

/** The pool's candles in USD per token, as [ts, open, high, low, close, volume], newest first. */
export async function candles(chain: string, pool: string, token: string, t: Timeframe): Promise<number[][]> {
  const net = CHAINS[chain]!.gt;
  const q = `aggregate=${t.agg}&limit=1000&currency=usd&token=${token}`;
  const body = await gt<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(`networks/${net}/pools/${pool}/ohlcv/${t.tf}?${q}`);
  return body.data?.attributes?.ohlcv_list ?? [];
}

/** The pool's latest trades (GeckoTerminal keeps up to 300 from the last day). */
export async function poolTrades(chain: string, pool: string): Promise<GtTrade[]> {
  const net = CHAINS[chain]!.gt;
  return (await gt<{ data?: GtTrade[] }>(`networks/${net}/pools/${pool}/trades`)).data ?? [];
}

/** Pairs for up to 30 tokens on one chain at once. */
export async function pairsFor(chain: string, addresses: string[]): Promise<DsPair[]> {
  const out: DsPair[] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const list = addresses.slice(i, i + 30).join(',');
    out.push(...((await get<DsPair[] | null>(`${DS}/tokens/v1/${chain}/${list}`)) ?? []));
  }
  return out;
}
