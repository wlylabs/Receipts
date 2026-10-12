import 'server-only';

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

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
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

interface Tx {
  blockTime: number | null;
  meta: { err: unknown; preTokenBalances?: Balance[]; postTokenBalances?: Balance[] } | null;
}

const txCache = new Map<string, Tx | null>();

/** How much of `mint` the owner gained (or lost, negative) in each of its latest transactions touching it. */
export async function tokenMoves(owner: string, mint: string): Promise<{ moves: { tx: string; ts: number; delta: number }[]; complete: boolean } | null> {
  const accounts = await rpc<{ value: { pubkey: string }[] }>('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]);
  // a closed account (sold out and reclaimed the rent) leaves nothing to read
  if (accounts.value.length === 0) return null;
  const sigs: { signature: string; err: unknown }[] = [];
  for (const { pubkey } of accounts.value) sigs.push(...(await rpc<{ signature: string; err: unknown }[]>('getSignaturesForAddress', [pubkey, { limit: MAX_TXS }])));
  const ok = sigs.filter((s) => !s.err).slice(0, MAX_TXS);
  const moves: { tx: string; ts: number; delta: number }[] = [];
  let read = 0;
  // one at a time, newest first: if the endpoint starts refusing, what was read still counts
  for (const sig of ok) {
    let tx: Tx | null;
    const cached = txCache.has(sig.signature);
    try {
      tx = await getTx(sig.signature);
    } catch (e) {
      if (read === 0) throw e;
      break;
    }
    read++;
    if (!tx?.meta || tx.meta.err || !tx.blockTime) continue;
    const sum = (list: Balance[] = []) =>
      list.filter((b) => b.mint === mint && b.owner === owner).reduce((acc, b) => acc + Number(b.uiTokenAmount.uiAmountString ?? b.uiTokenAmount.uiAmount ?? 0), 0);
    const delta = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
    if (delta !== 0) moves.push({ tx: sig.signature, ts: tx.blockTime, delta });
    if (PUBLIC && !cached) await sleep(120);
  }
  return { moves: moves.sort((a, b) => a.ts - b.ts), complete: read === ok.length && sigs.length < MAX_TXS };
}

async function getTx(sig: string): Promise<Tx | null> {
  if (txCache.has(sig)) return txCache.get(sig)!;
  const tx = await rpc<Tx | null>('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
  if (txCache.size > 5000) txCache.clear();
  txCache.set(sig, tx);
  return tx;
}
