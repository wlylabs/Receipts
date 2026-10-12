import { boostedTokens, findPair, poolTrades } from '../../../lib/upstream';
import { CHAINS } from '../../../lib/chains';
import { toTrades } from '../../../lib/receipts';
import { fail } from '../../../lib/respond';

/** A real wallet that traded a token DexScreener is boosting right now, for "next random trader". */
export async function GET() {
  try {
    const tokens = (await boostedTokens()).filter((t) => CHAINS[t.chainId]);
    for (let tries = 0; tries < 3 && tokens.length; tries++) {
      const pick = tokens.splice(Math.floor(Math.random() * tokens.length), 1)[0]!;
      const found = await findPair(pick.tokenAddress);
      if (!found) continue;
      const trades = toTrades(await poolTrades(found.pair.chainId, found.pair.pairAddress), found.tokenAddress);
      const traders = [...new Set(trades.map((t) => t.trader))];
      if (traders.length) {
        const address = traders[Math.floor(Math.random() * traders.length)]!;
        return Response.json({ address, ca: found.tokenAddress }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }
    return fail('no-trades', 'Nobody has traded the trending tokens lately.');
  } catch (e) {
    console.error('random trader', e);
    return fail('upstream', 'DexScreener or GeckoTerminal did not answer. Try again in a moment.');
  }
}
