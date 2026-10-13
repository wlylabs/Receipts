import 'server-only';
import { randomBytes } from 'node:crypto';
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
