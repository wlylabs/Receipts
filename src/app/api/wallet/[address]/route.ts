import { holdings as solanaHoldings } from '../../../../lib/solana';
import { historyChains, holdings as evmHoldings } from '../../../../lib/evm';
import { findPair, pairsFor } from '../../../../lib/upstream';
import { CHAINS } from '../../../../lib/chains';
import { bestPair, isWallet, sameAddress, toTokenInfo } from '../../../../lib/receipts';
import { fail, ok, tooMany } from '../../../../lib/respond';
import type { DsPair, Holding, WalletHoldings } from '../../../../lib/types';

/** Most tokens priced per chain: enough for any real wallet, short of the ones full of airdropped spam. */
const MAX = 300;

/** The tokens a wallet holds that trade on a DEX, biggest first, to pick one to replay. */
export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const limited = tooMany(req, 'wallet', 12);
  if (limited) return limited;
  const { address } = await ctx.params;
  if (!isWallet(address)) return fail('invalid', 'That is not a wallet address.');
  // asked alongside the holdings: is this address a token's CA rather than a wallet?
  const asToken = findPair(address).catch(() => null);
  try {
    const held: { chain: string; address: string; amount: number }[] = address.startsWith('0x')
      ? (
          await Promise.all(
            historyChains().map((chain) =>
              evmHoldings(chain, address)
                .then((h) => h.map((x) => ({ chain, ...x })))
                .catch(() => []),
            ),
          )
        ).flat()
      : (await solanaHoldings(address)).map((h) => ({ chain: 'solana', address: h.mint, amount: h.amount }));

    const out: Holding[] = [];
    for (const chain of new Set(held.map((h) => h.chain))) {
      // every token is priced, then sorted by value: the order the chain lists them in means nothing
      const mine = held.filter((h) => h.chain === chain).slice(0, MAX);
      const pairs = await pairsFor(chain, mine.map((h) => h.address)).catch(() => [] as DsPair[]);
      for (const h of mine) {
        const best = bestPair(pairs.filter((p) => CHAINS[p.chainId] && sameAddress(p.baseToken.address, h.address)));
        if (!best) continue;
        const token = toTokenInfo(best);
        out.push({ token, amount: h.amount, valueUsd: h.amount * token.priceUsd });
      }
    }
    const found = await asToken;
    const token = found ? { symbol: found.pair.baseToken.symbol, address: found.tokenAddress } : null;
    const body: WalletHoldings = { kind: 'wallet', owner: address, holdings: out.sort((a, b) => b.valueUsd - a.valueUsd), token };
    return ok(body);
  } catch (e) {
    console.error('wallet holdings', address, e);
    return fail('upstream', 'Couldn’t read this wallet’s tokens. Try again in a moment.');
  }
}
