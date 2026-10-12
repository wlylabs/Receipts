import { findPair } from '../../../../lib/upstream';
import { cleanAddress, isAddress, isWallet } from '../../../../lib/receipts';
import { fail, ok } from '../../../../lib/respond';
import type { Resolved } from '../../../../lib/types';

/** Whether a pasted address is a token (it has a DEX pair) or a wallet. */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const address = cleanAddress(decodeURIComponent((await ctx.params).address));
  if (!isAddress(address)) return fail('invalid', 'That doesn’t look like a Solana or EVM address.');
  try {
    const found = await findPair(address);
    if (found) return ok({ kind: 'token', address: found.tokenAddress } satisfies Resolved);
    if (isWallet(address)) return ok({ kind: 'wallet', address } satisfies Resolved);
    return fail('not-found', 'No token or wallet at that address.');
  } catch (e) {
    console.error('resolve', address, e);
    return fail('upstream', 'DexScreener did not answer. Try again in a moment.');
  }
}
