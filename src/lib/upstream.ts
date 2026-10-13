import 'server-only';
import { CHAINS } from './chains';
import { pacer } from './throttle';
import { bestPair, sameAddress } from './receipts';
import type { DsPair, GtTrade } from './types';

/**
 * DexScreener says what a token is and where it trades; GeckoTerminal has the pool's candles and
 * latest trades. Both are public and free, so every answer is cached for a minute: a busy page
 * costs each of them one request a minute per URL (GeckoTerminal allows about 30 a minute).
 */
const DS = 'https://api.dexscreener.com';
const GT = process.env.GECKOTERMINAL_API ?? 'https://api.geckoterminal.com/api/v2';
const TTL = 60;
/** GeckoTerminal's free API allows about 30 calls a minute; DexScreener's pair calls 300. */
const gtPace = pacer(25);
const dsPace = pacer(250);

export class NotFound extends Error {}

async function get<T>(url: string, headers: Record<string, string> = {}, pace?: () => Promise<void>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await pace?.();
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'Receipts (+https://github.com/wlylabs/receipts)', ...headers },
      next: { revalidate: TTL },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) throw new NotFound(url);
    // asked too often: wait what the source says (a few seconds at most) and ask once more
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, Math.min(5, Number(res.headers.get('retry-after')) || 2) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return (await res.json()) as T;
  }
}

const gt = <T>(path: string) => get<T>(`${GT}/${path}`, { accept: 'application/json;version=20230302' }, gtPace);
const ds = <T>(url: string) => get<T>(url, {}, dsPace);

/**
 * The token's deepest pool on a chain Receipts plays, or null. The address may also be a pair
 * (people paste dexscreener.com links), which the search finds.
 */
export async function findPair(address: string): Promise<{ pair: DsPair; tokenAddress: string } | null> {
  const byToken = (await ds<{ pairs: DsPair[] | null }>(`${DS}/latest/dex/tokens/${address}`)).pairs ?? [];
  const asBase = byToken.filter((p) => CHAINS[p.chainId] && sameAddress(p.baseToken.address, address));
  let best = bestPair(asBase);
  if (!best) {
    const found = (await ds<{ pairs: DsPair[] | null }>(`${DS}/latest/dex/search?q=${encodeURIComponent(address)}`)).pairs ?? [];
    best = bestPair(found.filter((p) => CHAINS[p.chainId] && sameAddress(p.pairAddress, address)));
  }
  return best ? { pair: best, tokenAddress: best.baseToken.address } : null;
}


/** Whether the address has pairs on chains Receipts does not play. */
export async function onOtherChain(address: string): Promise<string | null> {
  const pairs = (await ds<{ pairs: DsPair[] | null }>(`${DS}/latest/dex/tokens/${address}`)).pairs ?? [];
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

/** Pairs for any number of tokens on one chain, asked 30 at a time, a few batches at once. */
export async function pairsFor(chain: string, addresses: string[]): Promise<DsPair[]> {
  const batches: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) batches.push(addresses.slice(i, i + 30));
  const out: DsPair[] = [];
  for (let i = 0; i < batches.length; i += 4) {
    const lists = await Promise.all(batches.slice(i, i + 4).map((b) => ds<DsPair[] | null>(`${DS}/tokens/v1/${chain}/${b.join(',')}`).catch(() => null)));
    for (const l of lists) out.push(...(l ?? []));
  }
  return out;
}
