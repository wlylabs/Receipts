import type { PositionCalc, TokenInfo } from './types';
import { supplyOf } from './receipts';
import { mcap, usd } from './format';

/**
 * FMath, the fee and profit calculator for fomo traders. Its origin comes from the environment;
 * with none set, the plug is not shown.
 */
export const FMATH_URL = originOf(process.env.NEXT_PUBLIC_FMATH_URL);

export function originOf(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin;
  } catch {
    return null;
  }
}

/** The chains fomo trades, by DexScreener id, and whether FMath can look a token up on it. */
const FOMO_CHAINS: Record<string, { lookup: boolean }> = {
  solana: { lookup: true },
  base: { lookup: true },
  bsc: { lookup: true },
  ethereum: { lookup: true },
  monad: { lookup: true },
  robinhood: { lookup: false },
};

export interface Plug {
  title: string;
  body: string;
  cta: string;
  href: string;
}

/** FMath's profit calculator, opened on this token with these inputs filled in. */
export function profitLink(origin: string, token: Pick<TokenInfo, 'chain' | 'address'>, inputs: { buy?: number; entryMcap?: number | null }): string {
  const url = new URL('/profit/', origin);
  url.searchParams.set('chain', token.chain);
  if (FOMO_CHAINS[token.chain]?.lookup) url.searchParams.set('token', `${token.chain}:${token.address}`);
  if (inputs.buy && inputs.buy > 0) url.searchParams.set('buy', String(roundBuy(inputs.buy)));
  if (inputs.entryMcap && inputs.entryMcap > 0) url.searchParams.set('entryMcap', String(Math.round(inputs.entryMcap)));
  url.searchParams.set('source', 'receipts');
  return url.toString();
}

/** A buy size someone would type: whole dollars, two significant figures above $100. */
function roundBuy(n: number): number {
  if (n < 100) return Math.max(1, Math.round(n));
  const step = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / step) * step;
}

/** The pitch on a token's page: someone looking at a chart is deciding whether to buy it. */
export function tokenPlug(token: TokenInfo, origin: string | null = FMATH_URL): Plug | null {
  if (!origin || !FOMO_CHAINS[token.chain]) return null;
  const at = token.mcapUsd ? ` at ${mcap(token.mcapUsd)}` : '';
  return {
    title: `Thinking of buying $${token.symbol}${at}?`,
    body: 'See the move you need just to cover fomo’s fees, and what a 2x or 5x really nets, before you hit Buy.',
    cta: 'Run the numbers',
    href: profitLink(origin, token, { entryMcap: token.mcapUsd }),
  };
}

/**
 * The pitch under a wallet's receipt, picked by how the run went: the lesson the receipt just
 * taught is the one FMath helps with next time.
 */
export function traderPlug(token: TokenInfo, p: PositionCalc, origin: string | null = FMATH_URL): Plug | null {
  if (!origin || !FOMO_CHAINS[token.chain]) return null;
  const buy = p.buys ? p.usdIn / p.buys : undefined;
  const supply = supplyOf(token);
  const entryMcap = supply && p.tokensIn > 0 && p.usdIn > 0 ? (p.usdIn / p.tokensIn) * supply : token.mcapUsd;
  const href = profitLink(origin, token, { buy, entryMcap });
  const sym = `$${token.symbol}`;

  if (p.sells > 0 && p.missedUsd >= Math.max(10, 0.2 * p.usdIn)) {
    return {
      title: `Sold ${usd(p.missedUsd)} before the top.`,
      body: `Plan the exits before the buy: a stepped plan sells into the run instead of all at once. FMath lays one out for ${sym}, net of fees.`,
      cta: 'Plan the exits',
      href,
    };
  }
  // a loss this small is mostly fees: the receipt calls it a paper cut or breakeven
  if (p.pnl < 0 && -p.pnl < Math.max(1, 0.03 * p.usdIn)) {
    return {
      title: 'Fees ate this one.',
      body: `On a ${usd(buy ?? 100)} buy, fees and price impact decide whether a trade breaks even. FMath works out the exact move ${sym} needs before you’re in profit.`,
      cta: 'Check break-even',
      href,
    };
  }
  if (p.pnl < 0) {
    return {
      title: 'Know your break-even before the next buy.',
      body: `This one cost ${usd(-p.pnl)}. FMath shows the move a ${usd(buy ?? 100)} buy on ${sym} needs just to pay its fees back, and a target worth holding for.`,
      cta: 'Check break-even',
      href,
    };
  }
  if (p.open > 0 && p.openValue >= 1) {
    return {
      title: `Still holding ${usd(p.openValue)} of ${sym}.`,
      body: 'Pick the market cap you’d sell at and see what’s left after the sell fee, before the chart picks for you.',
      cta: 'Set a target',
      href,
    };
  }
  return {
    title: 'Do it again, with the math first.',
    body: `Fees, break-even and net profit for your next ${sym}-sized entry, worked out before you hit Buy.`,
    cta: 'Open FMath',
    href,
  };
}
