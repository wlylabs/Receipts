import 'server-only';
import type { Move, Moves } from './types';

/**
 * A wallet's history on EVM chains, read through the Etherscan-style account API that every
 * explorer here speaks: Etherscan's V2 API (one key for every chain) wherever ETHERSCAN_API_KEY is
 * set, being the steadiest; else Blockscout's free keyless instances where they run, and Routescan
 * (keyless) for Avalanche. Blockscout keeps its own API for wallet balances.
 */
export const BLOCKSCOUT: Record<string, string> = {
  ethereum: 'https://eth.blockscout.com',
  base: 'https://base.blockscout.com',
  optimism: 'https://explorer.optimism.io',
  arbitrum: 'https://arbitrum.blockscout.com',
  polygon: 'https://polygon.blockscout.com',
  robinhood: 'https://robinhoodchain.blockscout.com',
};

/** Etherscan V2's chain ids. */
const CHAIN_IDS: Record<string, number> = { ethereum: 1, base: 8453, optimism: 10, arbitrum: 42161, polygon: 137, bsc: 56, avalanche: 43114 };

interface Explorer {
  /** The Etherscan-style endpoint, query string to come. */
  api: string;
  /** Calls a second it allows; a few, on the free tiers. */
  rps: number;
}

/** Where a chain's history is read, or null when no free source has it. */
export function explorerFor(chain: string, env: Record<string, string | undefined> = process.env): Explorer | null {
  const key = env.ETHERSCAN_API_KEY;
  if (chain === 'bsc' && env.BSC_EXPLORER_API) return { api: `${env.BSC_EXPLORER_API}?`, rps: 3 };
  if (key && CHAIN_IDS[chain]) return { api: `https://api.etherscan.io/v2/api?chainid=${CHAIN_IDS[chain]}&apikey=${encodeURIComponent(key)}&`, rps: 4 };
  if (BLOCKSCOUT[chain]) return { api: `${BLOCKSCOUT[chain]}/api?`, rps: 5 };
  if (chain === 'avalanche') return { api: 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api?', rps: 2 };
  return null;
}

/** Chains a wallet's history can be read on. */
export const historyChains = (env: Record<string, string | undefined> = process.env) => ['ethereum', 'base', 'optimism', 'arbitrum', 'polygon', 'robinhood', 'bsc', 'avalanche'].filter((c) => explorerFor(c, env));

const PAGE = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One Etherscan-style call; an empty list when there is nothing, an error for anything else. */
async function account<T>(ex: Explorer, params: Record<string, string>): Promise<T[]> {
  const q = new URLSearchParams({ module: 'account', sort: 'desc', page: '1', offset: String(PAGE), ...params });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ex.api + q, { headers: { accept: 'application/json' }, next: { revalidate: 60 }, signal: AbortSignal.timeout(12_000) });
    if (res.status === 429 && attempt < 2) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`explorer ${res.status} ${params.action}`);
    const body = (await res.json()) as { status?: string; message?: string; result: T[] | string };
    if (Array.isArray(body.result)) return body.result;
    if (typeof body.result === 'string' && /rate limit/i.test(body.result) && attempt < 2) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    throw new Error(`explorer ${params.action}: ${body.message ?? ''} ${String(body.result).slice(0, 80)}`);
  }
}

export interface TokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
}

export interface NativeTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  isError?: string;
  gasUsed?: string;
  gasPrice?: string;
}

export interface InternalTx {
  transactionHash?: string;
  hash?: string;
  from: string;
  to: string;
  value: string;
  isError?: string;
}

/** Wrapped native coins and dollar stablecoins, by symbol: the other side of most swaps. */
const WRAPPED = new Set(['WETH', 'WBNB', 'WAVAX', 'WPOL', 'WMATIC']);
const STABLES = new Set(['USDC', 'USDT', 'DAI', 'USDC.E', 'USDBC', 'USDT.E', 'FDUSD', 'BUSD', 'USD1', 'PYUSD', 'USDE']);
const ZERO = '0x0000000000000000000000000000000000000000';
const DUST_NATIVE = 1e-6;
const DUST_USD = 0.05;

const amount = (value: string, decimals = 18) => Number(value) / 10 ** decimals;

/**
 * The wallet's moves of `token` from its transfers, each with what went the other way in the same
 * transaction: native coin sent with it or paid back to it (internal calls), wrapped native coin
 * and stablecoins, and the gas it paid. `legsFrom` is the oldest time the other lists reach back
 * to: before it what was paid is unknown and the move is called a swap unless it was a mint.
 */
export function readMoves(owner: string, token: string, mine: TokenTx[], legs: { tokens: TokenTx[]; txs: NativeTx[]; internal: InternalTx[]; from: number }): Move[] {
  const me = owner.toLowerCase();
  const t = token.toLowerCase();
  const byHash = new Map<string, TokenTx[]>();
  for (const x of mine) if (x.contractAddress.toLowerCase() === t) byHash.set(x.hash, [...(byHash.get(x.hash) ?? []), x]);
  const out: Move[] = [];
  for (const [hash, list] of byHash) {
    const sign = (x: { from: string; to: string }) => (x.to.toLowerCase() === me ? 1 : 0) - (x.from.toLowerCase() === me ? 1 : 0);
    const delta = list.reduce((acc, x) => acc + sign(x) * amount(x.value, Number(x.tokenDecimal ?? 18)), 0);
    if (!delta) continue;
    const ts = Number(list[0]!.timeStamp);
    if (ts < legs.from) {
      const minted = list.every((x) => x.from.toLowerCase() === ZERO);
      out.push({ tx: hash, ts, delta, kind: minted ? 'transfer' : 'swap' });
      continue;
    }
    let native = 0;
    let stable = 0;
    let fee = 0;
    for (const x of legs.tokens) {
      if (x.hash !== hash) continue;
      const sym = (x.tokenSymbol ?? '').toUpperCase();
      const v = sign(x) * amount(x.value, Number(x.tokenDecimal ?? 18));
      if (WRAPPED.has(sym)) native += v;
      else if (STABLES.has(sym)) stable += v;
    }
    for (const x of legs.txs) {
      if (x.hash !== hash || x.isError === '1') continue;
      native += sign(x) * amount(x.value);
      if (x.from.toLowerCase() === me) fee += amount(x.gasUsed ?? '0') * Number(x.gasPrice ?? 0);
    }
    for (const x of legs.internal) {
      if ((x.transactionHash ?? x.hash) !== hash || x.isError === '1') continue;
      native += sign(x) * amount(x.value);
    }
    const paid = delta > 0 ? -native > DUST_NATIVE || -stable > DUST_USD : native > DUST_NATIVE || stable > DUST_USD;
    out.push({ tx: hash, ts, delta, kind: paid ? 'swap' : 'transfer', native, stable, fee });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** The oldest time a newest-first page reaches back to: all of time when it is not full. */
const reach = (list: { timeStamp?: string }[]) => (list.length < PAGE ? 0 : Math.min(...list.map((x) => Number(x.timeStamp ?? Infinity))));

/** The wallet's moves of one token, oldest first, with what it paid or got for each. */
export async function tokenMoves(chain: string, owner: string, token: string): Promise<Moves | null> {
  const ex = explorerFor(chain);
  if (!ex) return null;
  const gap = 1000 / ex.rps;
  const mine = await account<TokenTx>(ex, { action: 'tokentx', address: owner, contractaddress: token });
  if (!mine.length) return { moves: [], complete: true };
  // the other side of each swap: every token transfer, transaction and internal call of the wallet
  await sleep(gap);
  const tokens = await account<TokenTx>(ex, { action: 'tokentx', address: owner }).catch(() => null);
  await sleep(gap);
  const txs = await account<NativeTx & { timeStamp?: string }>(ex, { action: 'txlist', address: owner }).catch(() => null);
  await sleep(gap);
  const internal = await account<InternalTx & { timeStamp?: string }>(ex, { action: 'txlistinternal', address: owner }).catch(() => null);
  const from = tokens && txs && internal ? Math.max(reach(tokens), reach(txs), reach(internal)) : Infinity;
  const moves = readMoves(owner, token, mine, { tokens: tokens ?? [], txs: txs ?? [], internal: internal ?? [], from });
  return { moves, complete: mine.length < PAGE };
}

/** The wallet's ERC-20 balances on one chain: Blockscout's list where it runs, else (or when it fails) the transfers added up. */
export async function holdings(chain: string, owner: string): Promise<{ address: string; amount: number }[]> {
  const base = BLOCKSCOUT[chain];
  // Blockscout turned away (its bot check refuses some servers): the transfers, where a key reads them
  const listed = base ? await blockscoutBalances(base, owner).catch((e: unknown) => (explorerFor(chain)?.api.includes('etherscan') ? null : Promise.reject(e))) : null;
  if (listed) return listed;
  // no balances list on the Etherscan-style API's free tier: add up the transfers instead
  const ex = explorerFor(chain);
  if (!ex) return [];
  return balancesFrom(owner, await account<TokenTx>(ex, { action: 'tokentx', address: owner }));
}

async function blockscoutBalances(base: string, owner: string): Promise<{ address: string; amount: number }[]> {
  const out: { address: string; amount: number }[] = [];
  let params = '';
  // a few pages: a wallet full of airdropped spam can run to hundreds
  for (let page = 0; page < 4; page++) {
    const res = await fetch(`${base}/api/v2/addresses/${owner}/tokens?type=ERC-20${params}`, { headers: { accept: 'application/json' }, next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`blockscout ${res.status}`);
    const body = (await res.json()) as { items?: { token: { address?: string; address_hash?: string; decimals?: string | null }; value: string }[]; next_page_params?: Record<string, string | number> | null };
    for (const i of body.items ?? []) {
      const address = (i.token.address_hash ?? i.token.address ?? '').toLowerCase();
      const n = amount(i.value, Number(i.token.decimals ?? 18));
      if (address && n > 0) out.push({ address, amount: n });
    }
    if (!body.next_page_params) break;
    params = '&' + new URLSearchParams(Object.entries(body.next_page_params).map(([k, v]) => [k, String(v)])).toString();
  }
  return out;
}

/** Balances as the sum of a wallet's token transfers in and out. */
export function balancesFrom(owner: string, transfers: TokenTx[]): { address: string; amount: number }[] {
  const me = owner.toLowerCase();
  const sums = new Map<string, number>();
  for (const x of transfers) {
    const v = amount(x.value, Number(x.tokenDecimal ?? 18));
    const a = x.contractAddress.toLowerCase();
    if (x.to.toLowerCase() === me) sums.set(a, (sums.get(a) ?? 0) + v);
    if (x.from.toLowerCase() === me) sums.set(a, (sums.get(a) ?? 0) - v);
  }
  return [...sums].filter(([, n]) => n > 1e-12).map(([address, n]) => ({ address, amount: n }));
}
