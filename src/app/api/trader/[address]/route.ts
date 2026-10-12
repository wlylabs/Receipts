import type { NextRequest } from 'next/server';
import { loadToken } from '../../../../lib/load';
import { cleanAddress, groupByTrader, isWallet, leaderboard, peakAfter, placement, position, windowOf } from '../../../../lib/receipts';
import { fail, ok } from '../../../../lib/respond';
import type { TraderReceipts } from '../../../../lib/types';

/** One wallet's receipt on one token, from the token's latest trades. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const ca = cleanAddress(req.nextUrl.searchParams.get('ca') ?? '');
  if (!isWallet(address)) return fail('invalid', 'That is not a wallet address.');
  if (!ca) return fail('invalid', 'Paste the token the wallet traded, too.');
  try {
    const r = await loadToken(ca);
    if (!r.ok) return fail(r.code, r.error);
    const { token, series, candle, highs, trades } = r.value;
    const key = address.startsWith('0x') ? address.toLowerCase() : address;
    const mine = groupByTrader(trades).get(key) ?? [];
    if (mine.length === 0) {
      return fail('no-trades', `No trades from this wallet in $${token.symbol}’s latest ${trades.length} trades. The feed only covers about the last day.`);
    }
    const board = leaderboard(trades, token.priceUsd);
    const pos = position(mine, token.priceUsd, peakAfter(highs, trades));
    const body: TraderReceipts = {
      kind: 'trader',
      owner: address,
      token,
      position: pos,
      trades: mine.map((t) => [t.ts, t.side, t.tokens, t.usd, t.priceUsd, t.tx]),
      series,
      candle,
      window: windowOf(trades),
      place: placement(pos.pnl, board.filter((b) => b.trader !== key)),
      of: board.length,
    };
    return ok(body);
  } catch (e) {
    console.error('trader receipts', address, ca, e);
    return fail('upstream', 'DexScreener or GeckoTerminal did not answer. Try again in a moment.');
  }
}
