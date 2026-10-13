import 'server-only';
import type { Move, Moves } from './types';

/**
 * Solana's own JSON-RPC: free and keyless on the public endpoint, which allows only a few
 * calls a second. Set SOLANA_RPC_URL to any other endpoint (a free Helius or Triton key) for
 * longer histories. Transactions never change, so each one is read once per server.
 */
const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const PUBLIC = !process.env.SOLANA_RPC_URL;
/** Latest transactions read per wallet and token. */
export const MAX_TXS = PUBLIC ? 30 : 120;
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 429 && attempt < 3) {
      await sleep(800 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`rpc ${res.status} ${method}`);
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`rpc ${method}: ${body.error.message}`);
    return body.result as T;
  }
}

interface ParsedAccount {
  pubkey: string;
  account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null; decimals: number } } } } };
}

/** Every token the wallet holds a balance of. */
export async function holdings(owner: string): Promise<{ mint: string; amount: number }[]> {
  const lists = await Promise.all(
    TOKEN_PROGRAMS.map((programId) => rpc<{ value: ParsedAccount[] }>('getTokenAccountsByOwner', [owner, { programId }, { encoding: 'jsonParsed' }])),
  );
  return lists
    .flatMap((l) => l.value)
    .map((a) => ({ mint: a.account.data.parsed.info.mint, amount: a.account.data.parsed.info.tokenAmount.uiAmount ?? 0 }))
    .filter((h) => h.amount > 0);
}

interface Balance {
  mint: string;
  owner?: string;
  uiTokenAmount: { uiAmountString?: string; uiAmount: number | null };
}

export interface Tx {
  blockTime: number | null;
  transaction?: { message?: { accountKeys?: ({ pubkey: string } | string)[] } };
  meta: { err: unknown; fee?: number; preBalances?: number[]; postBalances?: number[]; preTokenBalances?: Balance[]; postTokenBalances?: Balance[] } | null;
}

const WSOL = 'So11111111111111111111111111111111111111112';
/** USDC and USDT on Solana: a dollar each. */
const STABLES = new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
/** Less than this paid the other way is not a trade: rent, a tip, dust. */
const DUST_SOL = 0.0005;
const DUST_USD = 0.05;

/**
 * What one transaction did to the owner's balance of `mint`, and what went the other way: SOL
 * (native and wrapped, the network fee put back) and stablecoins. Opposite flows make a swap;
 * tokens moving with nothing paid are a transfer. Null when the transaction did not touch it.
 */
export function readMove(tx: Tx, sig: string, owner: string, mint: string): Move | null {
  if (!tx.meta || tx.meta.err || !tx.blockTime) return null;
  const { meta } = tx;
  const sum = (list: Balance[] = [], match: (m: string) => boolean) =>
    list.filter((b) => match(b.mint) && b.owner === owner).reduce((acc, b) => acc + Number(b.uiTokenAmount.uiAmountString ?? b.uiTokenAmount.uiAmount ?? 0), 0);
  const delta = (match: (m: string) => boolean) => sum(meta.postTokenBalances, match) - sum(meta.preTokenBalances, match);
  const tokens = delta((m) => m === mint);
  if (tokens === 0) return null;

  const keys = (tx.transaction?.message?.accountKeys ?? []).map((k) => (typeof k === 'string' ? k : k.pubkey));
  const i = keys.indexOf(owner);
  const payer = i === 0;
  const fee = payer ? (meta.fee ?? 0) / 1e9 : 0;
  const lamports = i >= 0 ? ((meta.postBalances?.[i] ?? 0) - (meta.preBalances?.[i] ?? 0)) / 1e9 : 0;
  const native = lamports + fee + delta((m) => m === WSOL);
  const stable = delta((m) => STABLES.has(m));
  const paid = tokens > 0 ? -native > DUST_SOL || -stable > DUST_USD : native > DUST_SOL || stable > DUST_USD;
  return { tx: sig, ts: tx.blockTime, delta: tokens, kind: paid ? 'swap' : 'transfer', native, stable, fee };
}

const txCache = new Map<string, Tx | null>();

/** The owner's associated token accounts for `mint`, under both token programs: they keep their history once closed. */
async function associated(owner: string, mint: string): Promise<string[]> {
  const { getAddressEncoder, getProgramDerivedAddress } = await import('@solana/addresses');
  const enc = getAddressEncoder();
  return Promise.all(
    TOKEN_PROGRAMS.map(async (program) => {
      const [ata] = await getProgramDerivedAddress({ programAddress: ATA_PROGRAM as never, seeds: [enc.encode(owner as never), enc.encode(program as never), enc.encode(mint as never)] });
      return ata as string;
    }),
  );
}

/**
 * The owner's moves of `mint` in its latest transactions touching it: from every token account
 * it has for the mint now, and from its associated accounts even once closed (a wallet that sold
 * out and took its rent back still has its history there).
 */
export async function tokenMoves(owner: string, mint: string): Promise<Moves | null> {
  const [open, atas] = await Promise.all([rpc<{ value: { pubkey: string }[] }>('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]), associated(owner, mint)]);
  const accounts = [...new Set([...open.value.map((a) => a.pubkey), ...atas])];
  const sigs = new Map<string, { signature: string; err: unknown; slot: number }>();
  let full = false;
  for (const pubkey of accounts) {
    const list = await rpc<{ signature: string; err: unknown; slot: number }[]>('getSignaturesForAddress', [pubkey, { limit: MAX_TXS }]);
    if (list.length >= MAX_TXS) full = true;
    for (const s of list) sigs.set(s.signature, s);
  }
  // newest first across every account, so what is cut off is the oldest
  const ok = [...sigs.values()].filter((s) => !s.err).sort((a, b) => b.slot - a.slot);
  const take = ok.slice(0, MAX_TXS);
  if (take.length === 0) return null;
  const moves: Move[] = [];
  let read = 0;
  // one at a time, newest first: if the endpoint starts refusing, what was read still counts
  for (const sig of take) {
    let tx: Tx | null;
    const cached = txCache.has(sig.signature);
    try {
      tx = await getTx(sig.signature);
    } catch (e) {
      if (read === 0) throw e;
      break;
    }
    read++;
    const m = tx && readMove(tx, sig.signature, owner, mint);
    if (m) moves.push(m);
    if (PUBLIC && !cached) await sleep(120);
  }
  return { moves: moves.sort((a, b) => a.ts - b.ts), complete: read === take.length && !full && ok.length <= MAX_TXS };
}
async function getTx(sig: string): Promise<Tx | null> {
  if (txCache.has(sig)) return txCache.get(sig)!;
  const tx = await rpc<Tx | null>('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
  if (txCache.size > 5000) txCache.clear();
  txCache.set(sig, tx);
  return tx;
}
