import { fail, tooMany } from '../../../../lib/respond';
import { isPaid, open, payConfig } from '../../../../lib/pay';

/** Whether the quote in `?token=` has been paid on chain. */
export async function GET(req: Request) {
  const limited = tooMany(req, 'pay-status', 60);
  if (limited) return limited;
  if (!payConfig()) return fail('not-found', 'Downloads are free here.');
  const q = open(new URL(req.url).searchParams.get('token') ?? '');
  if (!q) return fail('invalid', 'That payment can’t be checked. Start again.');
  try {
    return Response.json({ paid: await isPaid(q) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('pay-status', e);
    return fail('upstream', 'Solana did not answer. Still checking.');
  }
}
