import 'server-only';
import type { RawLaunch, RawPortfolio, RawRewards, RawTrade } from './types';

/**
 * bordrless.app's public read API. It sends no CORS headers, so only this app's route handlers
 * call it. Every answer is cached for a minute, so a busy page costs Bordrless one request a
 * minute per URL.
 */
const UPSTREAM = process.env.BORDRLESS_API ?? 'https://bordrless.app/api';
const TTL = 60;
const PAGE = 200;
/** A token's whole history is paged 200 trades at a time; past this many pages it is cut short. */
export const MAX_PAGES = 60;

export class NotFound extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${UPSTREAM}/${path}`, {
    headers: { accept: 'application/json', 'user-agent': 'Receipts (+https://github.com/wlylabs/receipts)' },
    next: { revalidate: TTL },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new NotFound(path);
  if (!res.ok) throw new Error(`bordrless ${res.status} ${path}`);
  return (await res.json()) as T;
}

export async function getOverview(): Promise<{ solUsd: number }> {
  const o = await get<{ solUsd: number }>('overview');
  return { solUsd: o.solUsd };
}

/** One launch, or null when the address is not a Bordrless launch. */
export async function getLaunch(mint: string): Promise<RawLaunch | null> {
  try {
    return await get<RawLaunch>(`launches/${mint}`);
  } catch (e) {
    if (e instanceof NotFound) return null;
    throw e;
  }
}

export async function listLaunches(sort: 'mcap' | 'volume', limit: number): Promise<RawLaunch[]> {
  return (await get<{ launches: RawLaunch[] }>(`launches?sort=${sort}&limit=${limit}`)).launches;
}

export async function getPortfolio(owner: string): Promise<RawPortfolio | null> {
  try {
    return await get<RawPortfolio>(`portfolio/${owner}`);
  } catch (e) {
    if (e instanceof NotFound) return null;
    throw e;
  }
}

export async function getRewards(owner: string): Promise<RawRewards | null> {
  try {
    return await get<RawRewards>(`rewards/${owner}`);
  } catch (e) {
    if (e instanceof NotFound) return null;
    throw e;
  }
}

/** The newest page of a launch's trades, newest first. */
export async function recentTrades(mint: string): Promise<RawTrade[]> {
  return (await get<{ trades: RawTrade[] }>(`launches/${mint}/trades?limit=${PAGE}`)).trades ?? [];
}

/**
 * Every trade of a launch since it opened, oldest first. The API pages by timestamp (`before`
 * is exclusive), so a page is asked again from its last second to keep trades sharing that
 * second, and signatures drop the repeats.
 */
export async function allTrades(mint: string): Promise<{ trades: RawTrade[]; complete: boolean }> {
  const seen = new Map<string, RawTrade>();
  let before: number | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q: string = `launches/${mint}/trades?limit=${PAGE}${before !== null ? `&before=${before}` : ''}`;
    const batch = (await get<{ trades: RawTrade[] }>(q)).trades ?? [];
    let added = 0;
    for (const t of batch) {
      if (!seen.has(t.signature)) {
        seen.set(t.signature, t);
        added++;
      }
    }
    const last = batch.at(-1);
    if (!last || batch.length < PAGE) return { trades: sortOldestFirst(seen), complete: true };
    // a full page from one second: step past it rather than ask for the same page forever
    const next: number = added === 0 ? last.ts : last.ts + 1;
    before = next === before ? last.ts : next;
  }
  return { trades: sortOldestFirst(seen), complete: false };
}

function sortOldestFirst(m: Map<string, RawTrade>): RawTrade[] {
  return [...m.values()].sort((a, b) => a.ts - b.ts || a.slot - b.slot);
}

/** Runs `fn` over `items` with at most `n` in flight. */
export async function pool<T, R>(items: readonly T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
