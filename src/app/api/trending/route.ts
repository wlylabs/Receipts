import { boostedTokens, pairsFor } from '../../../lib/upstream';
import { CHAINS } from '../../../lib/chains';
import { sameAddress, toTokenInfo } from '../../../lib/receipts';
import { fail, ok } from '../../../lib/respond';
import type { DsPair, TokenInfo } from '../../../lib/types';

/** Tokens DexScreener is boosting right now, on the chains Receipts plays. */
export async function GET() {
  try {
    const boosted = (await boostedTokens()).filter((t) => CHAINS[t.chainId]).slice(0, 30);
    const out: TokenInfo[] = [];
    for (const chain of new Set(boosted.map((b) => b.chainId))) {
      const addrs = boosted.filter((b) => b.chainId === chain).map((b) => b.tokenAddress);
      const pairs = await pairsFor(chain, addrs);
      for (const a of addrs) {
        const best = pairs.filter((p) => sameAddress(p.baseToken.address, a)).reduce<DsPair | null>((x, p) => (!x || (p.liquidity?.usd ?? 0) > (x.liquidity?.usd ?? 0) ? p : x), null);
        if (best) out.push(toTokenInfo(best));
      }
    }
    return ok({ tokens: out.slice(0, 12) });
  } catch (e) {
    console.error('trending', e);
    return fail('upstream', 'DexScreener did not answer.');
  }
}
