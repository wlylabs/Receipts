import { describe, expect, it } from 'vitest';
import { fitTimeframe, timeframeOf, windowFor } from './timeframes';

const NOW = 1_800_000_000;
const H = 3600;

describe('fitTimeframe', () => {
  it('opens on the finest candle that fits the run', () => {
    // twenty minutes of trading, sold out an hour ago: one-minute candles
    expect(fitTimeframe(NOW - 2 * H, NOW - 2 * H + 1200, false, NOW).label).toBe('1m');
    // a day of trading: fifteen-minute candles
    expect(fitTimeframe(NOW - 3 * 86_400, NOW - 2 * 86_400, false, NOW).label).toBe('15m');
  });

  it('runs a held bag up to now', () => {
    // bought a week ago and still holding: a week to show, in hours
    expect(fitTimeframe(NOW - 7 * 86_400, NOW - 7 * 86_400, true, NOW).label).toBe('4h');
  });
});

describe('windowFor', () => {
  it('pads the run and stops at now', () => {
    const t = timeframeOf('5m')!;
    expect(windowFor(t, NOW - 2 * H, NOW - 1.5 * H, false, NOW)).toEqual({ from: NOW - 2 * H - 3000, to: NOW - 1.5 * H + 3000, cut: false });
    expect(windowFor(t, NOW - H, NOW - 60, false, NOW).to).toBe(NOW);
  });

  it('starts later, and says so, when the candles are too fine to reach the first trade', () => {
    const w = windowFor(timeframeOf('1m')!, NOW - 30 * 86_400, NOW - H, false, NOW);
    expect(w.cut).toBe(true);
    expect((w.to - w.from) / 60).toBe(999);
  });
});
