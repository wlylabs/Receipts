import type { PositionCalc, TokenInfo } from './types';
import { supplyOf } from './receipts';
import { mcap, usd } from './format';

/**
 * fomo's referral, the same one FMath runs on: new sign-ups through it get 10% off trading fees.
 * Set NEXT_PUBLIC_FOMO_REFERRAL_URL to "off" to hide the card.
 */
export const REFERRAL = {
  url: referralUrl(process.env.NEXT_PUBLIC_FOMO_REFERRAL_URL),
  code: 'willydetrade',
} as const;

/** FMath, the fee and profit calculator for fomo traders; with no URL set, the card links only fomo. */
export const FMATH_URL = originOf(process.env.NEXT_PUBLIC_FMATH_URL);

export function referralUrl(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (v.toLowerCase() === 'off') return null;
  if (!v) return 'https://fomo.family/r/willydetrade';
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).toString();
  } catch {
    return null;
  }
}

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
  /** The fomo referral. */
  href: string;
  cta: string;
  /** FMath's calculator on this trade, for whoever wants to check the math first. */
  calc: { href: string; cta: string } | null;
}

interface Links {
  referral: string | null;
  fmath: string | null;
}

const LINKS: Links = { referral: REFERRAL.url, fmath: FMATH_URL };

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

const CTA = 'Get 10% off on fomo';

/** The pitch on a token's page: someone looking at a chart is deciding whether to buy it. */
export function tokenPlug(token: TokenInfo, links: Links = LINKS): Plug | null {
  if (!links.referral || !FOMO_CHAINS[token.chain]) return null;
  const at = token.mcapUsd ? ` at ${mcap(token.mcapUsd)}` : '';
  return {
    title: `Buying $${token.symbol}${at}? Pay 10% less to do it.`,
    body: `Trade it on fomo with code ${REFERRAL.code}: every trading fee comes in 10% lower, 0.50% becomes 0.45%.`,
    href: links.referral,
    cta: CTA,
    calc: links.fmath ? { href: profitLink(links.fmath, token, { entryMcap: token.mcapUsd }), cta: 'Break-even on FMath' } : null,
  };
}

/**
 * The pitch under a wallet's receipt, picked by how the run went: whatever the receipt just
 * made someone feel, the next trade costs 10% less in fees on fomo.
 */
export function traderPlug(token: TokenInfo, p: PositionCalc, links: Links = LINKS): Plug | null {
  if (!links.referral || !FOMO_CHAINS[token.chain]) return null;
  const buy = p.buys ? p.usdIn / p.buys : undefined;
  const supply = supplyOf(token);
  const entryMcap = supply && p.tokensIn > 0 && p.usdIn > 0 ? (p.usdIn / p.tokensIn) * supply : token.mcapUsd;
  const fmath = links.fmath ? profitLink(links.fmath, token, { buy, entryMcap }) : null;
  const sym = `$${token.symbol}`;
  const base = { href: links.referral, cta: CTA };
  const code = `fomo with code ${REFERRAL.code}`;

  if (p.sells > 0 && p.missedUsd >= Math.max(10, 0.2 * p.usdIn)) {
    return {
      ...base,
      title: `Sold ${usd(p.missedUsd)} before the top.`,
      body: `Keep more of every exit next time: on ${code}, each sell pays 10% less in fees.`,
      calc: fmath ? { href: fmath, cta: 'Plan the exits on FMath' } : null,
    };
  }
  // a loss this small is mostly fees: the receipt calls it a paper cut or breakeven
  if (p.pnl < 0 && -p.pnl < Math.max(1, 0.03 * p.usdIn)) {
    return {
      ...base,
      title: 'Fees ate this one.',
      body: `Small trades lose the most to fees. On ${code}, every one of them costs 10% less.`,
      calc: fmath ? { href: fmath, cta: 'Break-even on FMath' } : null,
    };
  }
  if (p.pnl < 0) {
    return {
      ...base,
      title: `Down ${usd(-p.pnl)}. Don’t pay full fees on the comeback.`,
      body: `On ${code}, every buy and sell costs 10% less in fees.`,
      calc: fmath ? { href: fmath, cta: 'Break-even on FMath' } : null,
    };
  }
  if (p.open > 0 && p.openValue >= 1) {
    return {
      ...base,
      title: `Still holding ${usd(p.openValue)} of ${sym}.`,
      body: `When you take profit, keep more of it: on ${code}, sells pay 10% less in fees.`,
      calc: fmath ? { href: fmath, cta: 'Set a target on FMath' } : null,
    };
  }
  return {
    ...base,
    title: p.pnl >= 1 ? `Up ${usd(p.pnl)}. Keep more of the next one.` : 'Keep more of the next one.',
    body: `On ${code}, every trading fee comes in 10% lower, 0.50% becomes 0.45%.`,
    calc: fmath ? { href: fmath, cta: 'Run the numbers on FMath' } : null,
  };
}
