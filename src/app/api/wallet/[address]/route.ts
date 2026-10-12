import { holdings as solanaHoldings } from '../../../../lib/solana';
import { BLOCKSCOUT, holdings as evmHoldings } from '../../../../lib/blockscout';
import { pairsFor } from '../../../../lib/upstream';
import { CHAINS } from '../../../../lib/chains';
import { isWallet, sameAddress, toTokenInfo } from '../../../../lib/receipts';
import { fail, ok } from '../../../../lib/respond';
import type { DsPair, Holding, WalletHoldings } from '../../../../lib/types';

const MAX = 60;

/** The tokens a wallet holds that trade on a DEX, biggest first, to pick one to pull receipts on. */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!isWallet(address)) return fail('invalid', 'That is not a wallet address.');
  try {
    const held: { chain: string; address: string; amount: number }[] = address.startsWith('0x')
      ? (
          await Promise.all(
            Object.keys(BLOCKSCOUT).map((chain) =>
              evmHoldings(chain, address)
                .then((h) => h.map((x) => ({ chain, ...x })))
                .catch(() => []),
            ),
          )
        ).flat()
      : (await solanaHoldings(address)).map((h) => ({ chain: 'solana', address: h.mint, amount: h.amount }));

    const out: Holding[] = [];
    for (const chain of new Set(held.map((h) => h.chain))) {
      const mine = held.filter((h) => h.chain === chain).slice(0, MAX);
      const pairs = await pairsFor(chain, mine.map((h) => h.address)).catch(() => [] as DsPair[]);
      for (const h of mine) {
        const best = pairs
          .filter((p) => CHAINS[p.chainId] && sameAddress(p.baseToken.address, h.address))
          .reduce<DsPair | null>((a, p) => (!a || (p.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? p : a), null);
        if (!best) continue;
        const token = toTokenInfo(best);
        out.push({ token, amount: h.amount, valueUsd: h.amount * token.priceUsd });
      }
    }
    const body: WalletHoldings = { kind: 'wallet', owner: address, holdings: out.sort((a, b) => b.valueUsd - a.valueUsd) };
    return ok(body);
  } catch (e) {
    console.error('wallet holdings', address, e);
    return fail('upstream', 'Couldn’t read this wallet’s tokens. Try again in a moment.');
  }
}
