import type { NextRequest } from 'next/server';
import { loadToken } from '../../../../lib/load';
import { cleanAddress, groupByTrader, isWallet, leaderboard, movesToTrades, peakAfter, placement, position, windowOf } from '../../../../lib/receipts';
import { tokenMoves as solanaMoves } from '../../../../lib/solana';
import { tokenMoves as blockscoutMoves } from '../../../../lib/blockscout';
import { fail, ok } from '../../../../lib/respond';
import type { Trade, TraderReceipts } from '../../../../lib/types';

/** Reading a history from the public Solana endpoint is slow; give it time. */
export const maxDuration = 60;

/**
 * One wallet's trades and P&L on one token. The chain itself is read where a free source has it
 * (Solana RPC, Blockscout); elsewhere, and when that fails, the token's latest DEX trades.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const ca = cleanAddress(req.nextUrl.searchParams.get('ca') ?? '');
  if (!isWallet(address)) return fail('invalid', 'That is not a wallet address.');
  if (!ca) return fail('invalid', 'Pick the token the wallet traded, too.');
  try {
    const r = await loadToken(ca);
    if (!r.ok) return fail(r.code, r.error);
    const { token, series, candles, candle, highs, trades } = r.value;
    if (address.startsWith('0x') !== token.address.startsWith('0x')) return fail('invalid', `That wallet can’t hold a ${token.chainName} token.`);
    const key = address.startsWith('0x') ? address.toLowerCase() : address;

    let mine: Trade[] = [];
    let source: TraderReceipts['source'] = 'feed';
    let complete = false;
    const onChain = await (token.chain === 'solana' ? solanaMoves(address, token.address) : blockscoutMoves(token.chain, address, token.address)).catch((e: unknown) => {
      console.error('chain history', address, token.address, e);
      return null;
    });
    if (onChain && onChain.moves.length) {
      mine = movesToTrades(onChain.moves, key, series, token.priceUsd);
      source = 'chain';
      complete = onChain.complete;
    } else {
      mine = groupByTrader(trades).get(key) ?? [];
    }
    if (mine.length === 0) return fail('no-trades', `No $${token.symbol} trades from this wallet that a free source can see.`);

    const board = leaderboard(trades, token.priceUsd);
    const pos = position(mine, token.priceUsd, peakAfter(highs, trades));
    const body: TraderReceipts = {
      kind: 'trader',
      owner: address,
      token,
      position: pos,
      trades: mine.map((t) => [t.ts, t.side, t.tokens, t.usd, t.priceUsd, t.tx]),
      series,
      candles,
      candle,
      window: windowOf(trades),
      place: placement(pos.pnl, board.filter((b) => b.trader !== key)),
      of: board.some((b) => b.trader === key) ? board.length : board.length + 1,
      source,
      complete,
    };
    return ok(body);
  } catch (e) {
    console.error('trader receipts', address, ca, e);
    return fail('upstream', 'A data source did not answer. Try again in a moment.');
  }
}
