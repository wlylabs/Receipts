import { allTrades, getLaunch, getOverview } from '../../../../lib/upstream';
import { ADDRESS_RE, athOf, leaderboard, priceSeries, toTokenInfo, tokenStats, toTrade } from '../../../../lib/receipts';
import { fail, ok } from '../../../../lib/respond';
import type { TokenReceipts } from '../../../../lib/types';

/** The board is sent whole so a pretend trade can be placed among every real trader. */
const MAX_BOARD = 3000;

export async function GET(_req: Request, ctx: { params: Promise<{ ca: string }> }) {
  const { ca } = await ctx.params;
  if (!ADDRESS_RE.test(ca)) return fail('invalid', 'That is not a Solana address.');
  try {
    const [launch, overview] = await Promise.all([getLaunch(ca), getOverview()]);
    if (!launch) return fail('not-found', 'No Bordrless launch at this address.');
    const { trades: raw, complete } = await allTrades(ca);
    const trades = raw.map((t) => toTrade(t, launch.decimals));
    if (trades.length === 0) return fail('no-trades', 'This token has no trades yet.');
    const token = toTokenInfo(launch, overview.solUsd);
    const body: TokenReceipts = {
      kind: 'token',
      token,
      solUsd: overview.solUsd,
      complete,
      series: priceSeries(trades),
      ath: athOf(trades),
      stats: tokenStats(trades),
      board: leaderboard(trades, token.priceSol, token.sellFeeBps).slice(0, MAX_BOARD),
    };
    return ok(body);
  } catch (e) {
    console.error('token receipts', ca, e);
    return fail('upstream', 'Bordrless did not answer. Try again in a moment.');
  }
}
