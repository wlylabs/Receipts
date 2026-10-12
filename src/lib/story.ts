/**
 * The words a video opens and closes on, picked from what the run actually did, so two videos
 * of two runs never read the same. The hook asks without giving the answer away; the verdict is
 * the answer in one line.
 */

const mult = (x: number) => (x >= 10 ? `${Math.round(x)}x` : `${x.toFixed(1).replace(/\.0$/, '')}x`);
const pctAbs = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;

export interface PaperStory {
  /** Index of the buy in the price line, and of the top and the low after the top. */
  entry: number;
  athIdx: number;
  dipIdx: number;
  holdNow: boolean;
  roi: number;
  /** What the bag fetched at the exit, and at the best exit along the way. */
  out: number;
  bestOut: number;
  usd: number;
}

/** The second line of a paper trade's hook: where the buy was, never how it went. */
export function paperHook(s: PaperStory, day: string): string {
  if (s.entry === 0) return 'bought at launch →';
  if (s.entry === s.athIdx) return 'bought the top →';
  if (s.entry === s.dipIdx) return 'bought the dip →';
  return `bought ${day} →`;
}

/** One line on how a paper trade went. */
export function paperVerdict(s: PaperStory): string {
  const top = s.bestOut / s.usd;
  const gaveBack = s.bestOut > 0 ? 1 - s.out / s.bestOut : 0;
  if (s.roi >= 1 && gaveBack < 0.15) return `${mult(1 + s.roi)} and sold near the top`;
  if (s.roi >= 1) return `${mult(1 + s.roi)}, but it was ${mult(top)} at the top`;
  if (s.roi > 0 && gaveBack > 0.5) return `Was ${mult(top)}, gave most of it back`;
  if (s.roi > 0) return `Up ${pctAbs(s.roi)}`;
  if (top >= 2) return `Was ${mult(top)} up, ended down ${pctAbs(s.roi)}`;
  if (s.holdNow && s.roi <= -0.5) return `Held through −${pctAbs(s.roi)}`;
  if (s.roi < 0) return `Down ${pctAbs(s.roi)}`;
  return 'Broke even';
}

export interface WalletStory {
  buys: number;
  sells: number;
  usdIn: number;
  pnl: number;
  roi: number | null;
  realized: number;
  unrealized: number;
  openValue: number;
  missedUsd: number;
}

/** The second line of a wallet's hook: how much it played, never how it went. */
export function walletHook(s: WalletStory, money: (n: number) => string): string {
  if (s.buys && s.sells) return `${s.buys} buys, ${s.sells} sells →`;
  if (s.buys) return `put in ${money(s.usdIn)} →`;
  return `${s.sells} sells →`;
}

/** One line on how a wallet did. */
export function walletVerdict(s: WalletStory, money: (n: number) => string): string {
  if (s.pnl > 0 && s.missedUsd > s.pnl) return `Up, but sold ${money(s.missedUsd)} before the top`;
  if (s.pnl > 0 && s.roi !== null && s.roi >= 1) return `${mult(1 + s.roi)} on what went in`;
  if (s.pnl > 0) return s.openValue > 0 ? 'In profit and still holding' : 'Took profit';
  if (s.pnl < 0 && s.unrealized < 0 && s.openValue > 0) return 'Still holding the bag';
  if (s.pnl < 0 && s.missedUsd > Math.abs(s.pnl)) return `Sold ${money(s.missedUsd)} before the top`;
  if (s.pnl < 0) return 'Paid the market';
  return 'Broke even';
}
