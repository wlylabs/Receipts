import type { Tone } from './game';

export interface MarketInput {
  priceUsd: number;
  athUsd: number;
  /** DexScreener's 24h change in percent, e.g. 12.5; null when it does not say. */
  change24h: number | null;
  /** Buys and sells in the latest trades. */
  buys: number;
  sells: number;
}

export interface Market {
  /** A word or two on where the token stands, e.g. "Pumping". */
  label: string;
  line: string;
  tone: Tone;
  /** Price under the top, 0 at the ATH and -0.9 at 90% down. */
  fromAth: number | null;
  /** Share of the latest trades that were buys, or null with none. */
  buyShare: number | null;
}

/** Where a token stands right now, read from its 24h move, its distance from the top and who is trading. */
export function marketOf(m: MarketInput): Market {
  const fromAth = m.athUsd > 0 && m.priceUsd > 0 ? Math.min(0, m.priceUsd / m.athUsd - 1) : null;
  const n = m.buys + m.sells;
  const buyShare = n > 0 ? m.buys / n : null;
  const ch = m.change24h ?? 0;
  const base = { fromAth, buyShare };
  if (fromAth !== null && fromAth > -0.1 && ch >= 0) return { ...base, label: 'At the top', line: 'Trading within 10% of its all-time high.', tone: 'pos' };
  if (ch >= 25) return { ...base, label: 'Pumping', line: `Up ${Math.round(ch)}% in a day.`, tone: 'pos' };
  if (ch <= -25) return { ...base, label: 'Dumping', line: `Down ${Math.round(-ch)}% in a day.`, tone: 'neg' };
  if (fromAth !== null && fromAth <= -0.9) return { ...base, label: 'Far off the top', line: `${Math.round(-fromAth * 100)}% under its all-time high.`, tone: 'neg' };
  if (buyShare !== null && n >= 20 && buyShare >= 0.6) return { ...base, label: 'Buyers in control', line: `${Math.round(buyShare * 100)}% of the latest trades are buys.`, tone: 'pos' };
  if (buyShare !== null && n >= 20 && buyShare <= 0.4) return { ...base, label: 'Sellers in control', line: `${Math.round((1 - buyShare) * 100)}% of the latest trades are sells.`, tone: 'neg' };
  if (ch >= 5) return { ...base, label: 'Climbing', line: `Up ${Math.round(ch)}% in a day.`, tone: 'pos' };
  if (ch <= -5) return { ...base, label: 'Cooling off', line: `Down ${Math.round(-ch)}% in a day.`, tone: 'neg' };
  return { ...base, label: 'Sideways', line: 'No big move in the last day.', tone: null };
}
