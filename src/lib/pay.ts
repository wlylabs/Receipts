import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAddressDecoder, isAddress } from '@solana/addresses';
import { rpc } from './solana';
import { nativeUsd } from './quotes';
import { findPair } from './upstream';
import { lamportsFor, pays, readQuote, signQuote, type Coin, type PayTx, type Quote } from './payment';
import { ata, compile, createAtaIdempotent, solTransfer, tokenTransferChecked, USDC_DECIMALS, USDC_MINT } from './solanaTx';

/**
 * Downloads are paid when PAY_WALLET (the Solana wallet that gets paid) and PAY_SECRET (any long
 * random string, to sign quotes) are set; PAY_PRICE_USD sets the price, a dollar by default.
 * With neither set, downloads stay free.
 */
const WALLET = process.env.PAY_WALLET?.trim() ?? '';
const SECRET = process.env.PAY_SECRET ?? '';
const PRICE = Number(process.env.PAY_PRICE_USD) > 0 ? Number(process.env.PAY_PRICE_USD) : 1;
/** How long a quote takes new payments. */
const TTL = 15 * 60;

/**
 * The owner downloads free: opening /owner/?key=OWNER_KEY once marks that browser with a cookie
 * signed by PAY_SECRET. Changing OWNER_KEY signs every marked browser out.
 */
const OWNER_KEY = process.env.OWNER_KEY ?? '';
export const OWNER_COOKIE = 'receipts_owner';
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
/** The cookie's value for the owner, or null when no owner key is set (or it is too short to trust). */
export const ownerMark = () => (OWNER_KEY.length >= 16 && SECRET ? createHmac('sha256', SECRET).update(`owner:${OWNER_KEY}`).digest('base64url') : null);
export const isOwnerKey = (key: string) => !!ownerMark() && same(key, OWNER_KEY);
export function isOwner(req: Request): boolean {
  const mark = ownerMark();
  if (!mark) return false;
  const got = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${OWNER_COOKIE}=`))?.slice(OWNER_COOKIE.length + 1);
  return !!got && same(got, mark);
}

export const payConfig = () => (WALLET && SECRET && isAddress(WALLET) ? { wallet: WALLET, priceUsd: PRICE } : null);

/** A fresh quote in the coin asked for, signed, or null when SOL's price can't be had. */
export async function quote(coin: Coin): Promise<{ token: string; quote: Quote } | null> {
  const cfg = payConfig()!;
  const now = Math.floor(Date.now() / 1000);
  let amount: bigint;
  if (coin === 'USDC') amount = BigInt(Math.round(cfg.priceUsd * 10 ** USDC_DECIMALS));
  else {
    const solUsd = await solPrice(now);
    if (!solUsd) return null;
    amount = lamportsFor(cfg.priceUsd, solUsd);
  }
  const q: Quote = { ref: getAddressDecoder().decode(randomBytes(32)), coin, amount: amount.toString(), exp: now + TTL };
  return { token: signQuote(q, SECRET), quote: q };
}

/** SOL in dollars: Pyth's latest hour, or the deepest SOL pool on DexScreener if Pyth is out. */
async function solPrice(now: number): Promise<number | null> {
  const pyth = (await nativeUsd('solana', now - 6 * 3600, now))?.(now);
  if (pyth) return pyth;
  const found = await findPair('So11111111111111111111111111111111111111112').catch(() => null);
  const dex = Number(found?.pair.priceUsd);
  return dex > 0 ? dex : null;
}

export const open = (token: string) => readQuote(token, SECRET);

/** The quote's payment for `payer`'s wallet to sign: base64, unsigned, on a fresh blockhash. */
export async function paymentTx(q: Quote, payer: string): Promise<string> {
  const to = payConfig()!.wallet;
  const { value } = await rpc<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const ixs =
    q.coin === 'SOL'
      ? [solTransfer(payer, to, BigInt(q.amount), q.ref)]
      : await (async () => {
          const [from, dest] = await Promise.all([ata(payer, USDC_MINT), ata(to, USDC_MINT)]);
          return [createAtaIdempotent(payer, dest, to, USDC_MINT), tokenTransferChecked(from, USDC_MINT, dest, payer, BigInt(q.amount), USDC_DECIMALS, q.ref)];
        })();
  return Buffer.from(compile(payer, value.blockhash, ixs)).toString('base64');
}

/** Whether a transaction carrying the quote's reference has paid it. */
export async function isPaid(q: Quote): Promise<boolean> {
  const sigs = await rpc<{ signature: string; err: unknown }[]>('getSignaturesForAddress', [q.ref, { limit: 10, commitment: 'confirmed' }]);
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await rpc<PayTx | null>('getTransaction', [s.signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    if (tx && pays(tx, q, payConfig()!.wallet)) return true;
  }
  return false;
}
