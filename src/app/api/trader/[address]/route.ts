import { allTrades, getLaunch, getOverview, getPortfolio, getRewards, listLaunches, pool, recentTrades } from '../../../../lib/upstream';
import { ADDRESS_RE, athOf, peaksAfter, position, priceSeries, toTokenInfo, toTrade } from '../../../../lib/receipts';
import { fail, ok } from '../../../../lib/respond';
import type { IsToken, Position, TraderReceipts, TraderTotals } from '../../../../lib/types';

/** Tokens read per wallet, most recently held first. */
const MAX_TOKENS = 24;
/** Busiest launches whose latest trades are checked for this wallet. */
const SCAN_BUSY = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!ADDRESS_RE.test(address)) return fail('invalid', 'That is not a Solana address.');
  try {
    const [overview, portfolio, rewards] = await Promise.all([getOverview(), getPortfolio(address), getRewards(address)]);

    // every Bordrless token the wallet holds, created, or earned rewards on
    const balances = new Map<string, number | undefined>();
    const earned = new Map<string, number>();
    for (const e of portfolio?.entries ?? []) if (e.kind === 'launch') balances.set(e.mint, Number(e.amount) / 10 ** e.decimals);
    for (const r of rewards?.positions ?? []) {
      earned.set(r.mint, (Number(r.claimable) + Number(r.claimed)) / 1e9);
      if (!balances.has(r.mint)) balances.set(r.mint, Number(r.balance) / 10 ** r.decimals);
    }
    for (const c of portfolio?.created ?? []) if (!balances.has(c.mint)) balances.set(c.mint, undefined);
    // a bag sold to zero can leave the portfolio; the busiest tokens' latest trades find those
    const busy = await listLaunches('volume', SCAN_BUSY).catch(() => []);
    await pool(busy, 6, async (l) => {
      if (balances.has(l.mint)) return;
      const recent = await recentTrades(l.mint).catch(() => []);
      if (recent.some((t) => t.trader === address)) balances.set(l.mint, undefined);
    });
    const mints = [...balances.keys()].slice(0, MAX_TOKENS);

    const found = await pool(mints, 4, async (mint): Promise<Position | null> => {
      const launch = await getLaunch(mint);
      if (!launch) return null;
      const { trades: raw, complete } = await allTrades(mint);
      const trades = raw.map((t) => toTrade(t, launch.decimals));
      const mine = trades.filter((t) => t.trader === address);
      if (mine.length === 0) return null;
      const token = toTokenInfo(launch, overview.solUsd);
      const calc = position(mine, {
        priceSol: token.priceSol,
        sellFeeBps: token.sellFeeBps,
        balance: balances.get(mint),
        rewards: earned.get(mint) ?? 0,
        peaks: peaksAfter(trades),
      });
      return {
        ...calc,
        token,
        trades: mine.map((t) => [t.ts, t.side, t.tokens, t.sol, t.priceSol, t.sig]),
        athSol: athOf(trades).priceSol,
        series: priceSeries(trades, 160),
        complete,
      };
    });
    const positions = found.filter((p): p is Position => p !== null).sort((a, b) => b.lastTs - a.lastTs);

    if (positions.length === 0) {
      // a contract address pasted in the wrong box
      if (await getLaunch(address)) return ok({ kind: 'is-token', mint: address } satisfies IsToken);
      return fail('no-trades', 'No Bordrless trades from this wallet yet.');
    }

    const body: TraderReceipts = {
      kind: 'trader',
      owner: address,
      solUsd: overview.solUsd,
      walletSol: Number(portfolio?.lamports ?? 0) / 1e9,
      positions,
      totals: totals(positions),
      complete: positions.every((p) => p.complete) && balances.size <= MAX_TOKENS,
    };
    return ok(body);
  } catch (e) {
    console.error('trader receipts', address, e);
    return fail('upstream', 'Bordrless did not answer. Try again in a moment.');
  }
}

function totals(ps: Position[]): TraderTotals {
  const t: TraderTotals = { solIn: 0, solOut: 0, holdValue: 0, rewards: 0, pnl: 0, roi: null, trades: 0, wins: 0, losses: 0, missedSol: 0, firstTs: Infinity, lastTs: 0 };
  for (const p of ps) {
    t.solIn += p.solIn;
    t.solOut += p.solOut;
    t.holdValue += p.holdValue;
    t.rewards += p.rewards;
    t.pnl += p.pnl;
    t.trades += p.trades.length;
    t.missedSol += p.missedSol;
    if (p.pnl > 0) t.wins++;
    else if (p.pnl < 0) t.losses++;
    t.firstTs = Math.min(t.firstTs, p.firstTs);
    t.lastTs = Math.max(t.lastTs, p.lastTs);
  }
  t.roi = t.solIn > 0 ? t.pnl / t.solIn : null;
  if (!Number.isFinite(t.firstTs)) t.firstTs = 0;
  return t;
}
