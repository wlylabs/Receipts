/** The candle sizes a replay can be drawn in, as GeckoTerminal serves them. */
export interface Timeframe {
  label: string;
  tf: 'minute' | 'hour' | 'day';
  agg: number;
  sec: number;
}

export const TIMEFRAMES: readonly Timeframe[] = [
  { label: '1m', tf: 'minute', agg: 1, sec: 60 },
  { label: '5m', tf: 'minute', agg: 5, sec: 300 },
  { label: '15m', tf: 'minute', agg: 15, sec: 900 },
  { label: '1h', tf: 'hour', agg: 1, sec: 3600 },
  { label: '4h', tf: 'hour', agg: 4, sec: 14_400 },
  { label: '1D', tf: 'day', agg: 1, sec: 86_400 },
];

export const timeframeOf = (label: string | null | undefined): Timeframe | undefined => TIMEFRAMES.find((t) => t.label === label);

/** Most candles one GeckoTerminal page holds. */
export const MAX_CANDLES = 1000;
/** Candles the picked-for-you size aims to fit the wallet's run into. */
const FIT = 150;
/** Candles of quiet chart before the first trade and after the last. */
const PAD = 10;

/**
 * The stretch a replay shows in one candle size: from a little before the wallet's first trade to
 * a little after its last, or to now while it still holds some. A size too fine to reach back that
 * far in one page starts later, and says so.
 */
export function windowFor(t: Timeframe, first: number, last: number, holding: boolean, now: number): { from: number; to: number; cut: boolean } {
  const to = Math.min(now, holding ? now : last + PAD * t.sec);
  const want = Math.min(first, last) - PAD * t.sec;
  const from = Math.max(want, to - (MAX_CANDLES - 1) * t.sec);
  return { from, to, cut: from > first };
}

/** The finest size that fits the wallet's run into a readable count, the way a chart app opens. */
export function fitTimeframe(first: number, last: number, holding: boolean, now: number): Timeframe {
  return TIMEFRAMES.find((t) => {
    const w = windowFor(t, first, last, holding, now);
    return !w.cut && (w.to - w.from) / t.sec <= FIT;
  }) ?? TIMEFRAMES.at(-1)!;
}
