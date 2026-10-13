import type { NextRequest } from 'next/server';
import { candles } from '../../../../lib/upstream';
import { CHAINS } from '../../../../lib/chains';
import { cleanAddress, isAddress } from '../../../../lib/receipts';
import { toCandles } from '../../../../lib/candles';
import { MAX_CANDLES, timeframeOf } from '../../../../lib/timeframes';
import { fail, ok, tooMany } from '../../../../lib/respond';
import type { CandlesBody } from '../../../../lib/types';

/** A pool's candles in one size over one stretch, for a replay drawn in the candle size picked. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ pool: string }> }) {
  const limited = tooMany(req, 'candles', 30);
  if (limited) return limited;
  const q = req.nextUrl.searchParams;
  const pool = cleanAddress(decodeURIComponent((await ctx.params).pool));
  const token = cleanAddress(q.get('token') ?? '');
  const chain = q.get('chain') ?? '';
  const t = timeframeOf(q.get('tf'));
  const from = Number(q.get('from'));
  const to = Number(q.get('to'));
  if (!CHAINS[chain] || !isAddress(pool) || !isAddress(token)) return fail('invalid', 'Pick a pool and a token.');
  if (!t || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return fail('invalid', 'Pick a candle size and a stretch.');
  const limit = Math.min(MAX_CANDLES, Math.ceil((to - from) / t.sec) + 1);
  try {
    // GeckoTerminal counts back from `before`: ask for the candle that holds `to`, and enough before it
    const raw = await candles(chain, pool, token, t, { limit, before: to + t.sec });
    const body: CandlesBody = { candles: toCandles(raw).filter((c) => c[0] + t.sec > from && c[0] <= to), step: t.sec, tf: t.label };
    return ok(body);
  } catch (e) {
    console.error('candles', chain, pool, t.label, e);
    return fail('upstream', 'GeckoTerminal did not answer. Try again in a moment.');
  }
}
