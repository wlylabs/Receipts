import { loadToken } from '../../../../lib/load';
import { leaderboard, windowOf } from '../../../../lib/receipts';
import { fail, ok } from '../../../../lib/respond';
import type { TokenReceipts } from '../../../../lib/types';

export async function GET(_req: Request, ctx: { params: Promise<{ ca: string }> }) {
  const { ca } = await ctx.params;
  try {
    const r = await loadToken(ca);
    if (!r.ok) return fail(r.code, r.error);
    const { token, series, candles, candle, ath, trades } = r.value;
    if (series.length < 2) return fail('no-trades', 'This token has no chart yet. Try again once it has traded for a while.');
    const body: TokenReceipts = { kind: 'token', token, series, candles, candle, ath, window: windowOf(trades), board: leaderboard(trades, token.priceUsd) };
    return ok(body);
  } catch (e) {
    console.error('token receipts', ca, e);
    return fail('upstream', 'DexScreener or GeckoTerminal did not answer. Try again in a moment.');
  }
}
