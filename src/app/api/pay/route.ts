import { fail, tooMany } from '../../../lib/respond';
import { payConfig, quote } from '../../../lib/pay';
import { shown, type Coin } from '../../../lib/payment';
import { SITE_NAME } from '../../../lib/site';
import { USDC_MINT } from '../../../lib/solanaTx';
import type { PayInfo, PayQuote } from '../../../lib/types';

const fresh = (body: unknown) => Response.json(body, { headers: { 'Cache-Control': 'no-store' } });

/** Whether downloads are paid, and what they cost. */
export function GET() {
  const cfg = payConfig();
  return fresh((cfg ? { paid: true, priceUsd: cfg.priceUsd } : { paid: false }) satisfies PayInfo);
}

/** A quote for one download, in USDC or SOL. */
export async function POST(req: Request) {
  const limited = tooMany(req, 'pay', 20);
  if (limited) return limited;
  const cfg = payConfig();
  if (!cfg) return fail('not-found', 'Downloads are free here.');
  const { coin } = (await req.json().catch(() => ({}))) as { coin?: Coin };
  if (coin !== 'USDC' && coin !== 'SOL') return fail('invalid', 'Pay in USDC or SOL.');
  const made = await quote(coin).catch(() => null);
  if (!made) return fail('upstream', 'SOL’s price is out of reach right now. Pay in USDC, or try again.');
  const { token, quote: q } = made;
  const params = new URLSearchParams({ amount: shown(q), reference: q.ref, label: SITE_NAME, message: 'Video download' });
  if (coin === 'USDC') params.set('spl-token', USDC_MINT);
  return fresh({ token, coin, amount: shown(q), url: `solana:${cfg.wallet}?${params.toString().replace(/\+/g, '%20')}`, exp: q.exp } satisfies PayQuote);
}
