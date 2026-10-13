import { createHmac, timingSafeEqual } from 'node:crypto';
import { USDC_MINT } from './solanaTx';

/**
 * Paying for a download: a quote names the coin, the amount and a fresh reference key, and is
 * signed so the server can trust it back without storing it. The payment is found on chain by the
 * reference and counts once it brings the recipient at least the quoted amount.
 */

export type Coin = 'USDC' | 'SOL';

export interface Quote {
  /** The reference key the payment carries. */
  ref: string;
  coin: Coin;
  /** In base units: lamports, or millionths of a USDC. */
  amount: string;
  /** Unix seconds after which a new payment under this quote is no longer taken. */
  exp: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest();

export function signQuote(q: Quote, secret: string): string {
  const body = b64(JSON.stringify(q));
  return `${body}.${b64(mac(body, secret))}`;
}

/** The quote inside a token, or null if it was not signed here (or is malformed). */
export function readQuote(token: string, secret: string): Quote | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = mac(body, secret);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const q = JSON.parse(Buffer.from(body, 'base64url').toString()) as Quote;
    return q.coin === 'USDC' || q.coin === 'SOL' ? q : null;
  } catch {
    return null;
  }
}

/** A quote's amount as people read it, without trailing zeros. */
export function shown(q: Pick<Quote, 'coin' | 'amount'>): string {
  const decimals = q.coin === 'SOL' ? 9 : 6;
  const n = BigInt(q.amount);
  const unit = 10n ** BigInt(decimals);
  const frac = (n % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${n / unit}.${frac}` : `${n / unit}`;
}

/** Lamports for a dollar price, rounded up to a hundred-thousandth of a SOL. */
export function lamportsFor(usd: number, solUsd: number): bigint {
  const step = 10_000;
  return BigInt(Math.ceil((usd / solUsd) * 1e9 / step) * step);
}

interface TokenBalance {
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

export interface PayTx {
  blockTime: number | null;
  transaction?: { message?: { accountKeys?: ({ pubkey: string } | string)[] } };
  meta: { err: unknown; preBalances?: number[]; postBalances?: number[]; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null;
}

/** What one transaction brought `recipient` in the quote's coin, in base units. */
export function received(tx: PayTx, coin: Coin, recipient: string): bigint {
  if (!tx.meta || tx.meta.err) return 0n;
  if (coin === 'SOL') {
    const keys = (tx.transaction?.message?.accountKeys ?? []).map((k) => (typeof k === 'string' ? k : k.pubkey));
    const i = keys.indexOf(recipient);
    if (i < 0) return 0n;
    return BigInt((tx.meta.postBalances?.[i] ?? 0) - (tx.meta.preBalances?.[i] ?? 0));
  }
  const sum = (list: TokenBalance[] = []) => list.filter((b) => b.mint === USDC_MINT && b.owner === recipient).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
}

/** Whether a transaction pays the quote: sent in time, and at least the amount. */
export function pays(tx: PayTx, q: Quote, recipient: string, grace = 300): boolean {
  if (!tx.blockTime || tx.blockTime > q.exp + grace) return false;
  return received(tx, q.coin, recipient) >= BigInt(q.amount);
}
