import { describe, expect, it } from 'vitest';
import { bucket, candleAt, endedUp, mergeMarkers, logTicks, range, stepOf, toCandles, upTo, type Candle, heikinAshi } from './candles';

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

  it('marks each candle once per side, the buy under it and the sell over it', () => {
    const k = five(3);
    const t = (ts: number, kind: 'buy' | 'sell', price = 1) => ({ ts, price, kind });
    expect(mergeMarkers([t(10, 'buy', 1.2), t(20, 'sell', 2), t(30, 'buy', 1.1), t(40, 'sell', 3), t(350, 'buy', 2), t(700, 'sell')], k, 300)).toEqual([
      { ts: 10, price: 1.1, kind: 'buy' },
      { ts: 20, price: 3, kind: 'sell' },
      { ts: 350, price: 2, kind: 'buy' },
      { ts: 700, price: 1, kind: 'sell' },
    ]);
  });

  it('shows trades apart on finer candles and together on coarser ones', () => {
    // five buys a minute apart: five markers on 1-minute candles, one on a 5-minute candle
    const buys = [0, 60, 120, 180, 240].map((ts) => ({ ts, price: 1, kind: 'buy' as const }));
    const minute: Candle[] = buys.map(({ ts }) => [ts, 1, 1, 1, 1]);
    expect(mergeMarkers(buys, minute, 60)).toHaveLength(5);
    expect(mergeMarkers(buys, [[0, 1, 1, 1, 1]], 300)).toHaveLength(1);
  });

  it('can take in trades a few candles on too', () => {
    const k = five(10);
    const m = (ts: number) => ({ ts, price: 1, kind: 'buy' as const });
    expect(mergeMarkers([m(0), m(600), m(900), m(2400)], k, 300, 3)).toHaveLength(2);
  });
});

describe('heikinAshi', () => {
  it('smooths each candle with the one before', () => {
    const ha = heikinAshi([
      [0, 10, 14, 8, 12],
      [60, 12, 16, 11, 15],
    ]);
    expect(ha[0]).toEqual([0, 11, 14, 8, 11]);
    // open: the middle of the last body; close: the average price; wicks reach the further out
    expect(ha[1]).toEqual([60, 11, 16, 11, 13.5]);
  });
  it('keeps every high at or above its body and every low at or below it', () => {
    const ha = heikinAshi([
      [0, 10, 10.5, 9.5, 10],
      [60, 30, 31, 29, 30],
    ]);
    for (const [, o, h, l, c] of ha) {
      expect(h).toBeGreaterThanOrEqual(Math.max(o, c));
      expect(l).toBeLessThanOrEqual(Math.min(o, c));
    }
  });
});

describe('endedUp', () => {
  it('compares the last close with the first open', () => {
    const k = (o: number, c: number): Candle => [0, o, Math.max(o, c), Math.min(o, c), c];
    expect(endedUp([k(1, 0.5), k(0.5, 1.2)])).toBe(true);
    expect(endedUp([k(1, 2), k(2, 0.9)])).toBe(false);
    expect(endedUp([])).toBe(true);
  });
});
