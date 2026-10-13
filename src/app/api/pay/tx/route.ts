import { isAddress } from '@solana/addresses';
import { fail, tooMany } from '../../../../lib/respond';
import { open, payConfig, paymentTx } from '../../../../lib/pay';

/** The quote's payment as a transaction, for the payer's wallet to sign and send. */
export async function POST(req: Request) {
  const limited = tooMany(req, 'pay-tx', 20);
  if (limited) return limited;
  if (!payConfig()) return fail('not-found', 'Downloads are free here.');
  const { token, account } = (await req.json().catch(() => ({}))) as { token?: string; account?: string };
  const q = token ? open(token) : null;
  if (!q || !account || !isAddress(account)) return fail('invalid', 'That payment can’t be made. Start again.');
  if (q.exp < Date.now() / 1000) return fail('invalid', 'That price ran out. Start again.');
  try {
    return Response.json({ transaction: await paymentTx(q, account) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('pay-tx', e);
    return fail('upstream', 'Solana did not answer. Try again in a moment.');
  }
}
