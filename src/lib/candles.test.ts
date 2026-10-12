import { describe, expect, it } from 'vitest';
import { bucket, candleAt, logTicks, range, stepOf, toCandles, upTo, type Candle } from './candles';

const five = (n: number): Candle[] => Array.from({ length: n }, (_, i): Candle => [i * 300, 1 + i, 2 + i, 0.5 + i, 1.5 + i]);

describe('candles', () => {
  it('reads GeckoTerminal rows oldest first and drops empty ones', () => {
    expect(toCandles([[600, 1, 2, 0.5, 1.5, 9], [300, 1, 1, 1, 1, 0], [0, 0, 0, 0, 0, 0]])).toEqual([
      [300, 1, 1, 1, 1],
      [600, 1, 2, 0.5, 1.5],
    ]);
  });

  it('finds the candle size from the usual gap', () => {
    expect(stepOf([[0, 1, 1, 1, 1], [300, 1, 1, 1, 1], [600, 1, 1, 1, 1], [1500, 1, 1, 1, 1]])).toBe(300);
  });

  it('merges candles down to a count, keeping open, high, low and close right', () => {
    const { candles, step } = bucket(five(10), 5);
    expect(step).toBe(600);
    expect(candles).toHaveLength(5);
    expect(candles[0]).toEqual([0, 1, 3, 0.5, 2.5]);
    expect(bucket(five(4), 5).candles).toHaveLength(4);
  });

  it('shows closed candles whole, grows the open one and hides the rest', () => {
    const k = five(3);
    expect(upTo(k, 300, 300)).toEqual(k.slice(0, 1).concat([[300, 2, 2, 2, 2]]));
    const half = upTo(k, 300, 750);
    expect(half).toHaveLength(3);
    expect(half[2]![4]).toBeCloseTo(3.25);
    expect(upTo(k, 300, Infinity)).toEqual(k);
  });

  it('finds the candle a trade fell in', () => {
    const k = five(3);
    expect(candleAt(k, 300, 450)?.[0]).toBe(300);
    expect(candleAt(k, 300, -10)?.[0]).toBe(0);
  });

  it('fits wicks and extra prices, and ticks stay inside', () => {
    const { lo, hi } = range(five(3), [10]);
    expect(lo).toBe(0.5);
    expect(hi).toBe(10);
    for (const t of logTicks(lo, hi, 4)) {
      expect(t).toBeGreaterThanOrEqual(lo * 0.9);
      expect(t).toBeLessThanOrEqual(hi * 1.1);
    }
  });
});
