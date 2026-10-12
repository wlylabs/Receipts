import { describe, expect, it } from 'vitest';
import { cleanAddress, leaderboard, peaksAfter, placement, position, priceSeries, rankOf, simulate, toTrade } from './receipts';
import type { Trade } from './types';

const W = '2eZJN9uAvrsYjcx45xph2dZAyAsX6oLDpgVzsNNSKxQr';
let n = 0;
const tr = (side: 'buy' | 'sell', tokens: number, sol: number, ts: number, trader = W): Trade => ({
  sig: `s${n++}`,
  ts,
  trader,
  side,
  tokens,
  sol,
  priceSol: sol / tokens,
});

describe('cleanAddress', () => {
  it('pulls the address out of a pasted link', () => {
    expect(cleanAddress(`  https://bordrless.app/token/${W}?x=1 `)).toBe(W);
    expect(cleanAddress('nope')).toBe('nope');
  });
});

describe('toTrade', () => {
  it('scales lamports and base units', () => {
    const t = toTrade({ signature: 'a', slot: 1, ts: 2, trader: W, side: 'buy', baseAmount: '5000000', quoteAmount: '250000000', priceQuote: 0.05, priceUsd: 5 });
    expect(t.tokens).toBe(5);
    expect(t.sol).toBe(0.25);
  });
});

describe('position', () => {
  it('counts sells, the bag left and what it is worth', () => {
    const trades = [tr('buy', 1000, 1, 1), tr('sell', 500, 2, 2)];
    const p = position(trades, { priceSol: 0.004, sellFeeBps: 0 });
    expect(p.solIn).toBe(1);
    expect(p.solOut).toBe(2);
    expect(p.held).toBe(500);
    expect(p.holdValue).toBeCloseTo(2);
    expect(p.pnl).toBeCloseTo(3);
    expect(p.roi).toBeCloseTo(3);
    expect(p.realized).toBeCloseTo(1.5);
  });

  it('caps the bag at what the trades explain and adds rewards', () => {
    const p = position([tr('buy', 100, 1, 1)], { priceSol: 0.01, sellFeeBps: 1000, balance: 5000, rewards: 0.5 });
    expect(p.held).toBe(100);
    expect(p.holdValue).toBeCloseTo(0.9);
    expect(p.pnl).toBeCloseTo(0.4);
  });

  it('prices the paper hands against the top after each sell', () => {
    const trades = [tr('buy', 100, 1, 1), tr('sell', 100, 2, 2), tr('buy', 10, 1, 3)];
    const p = position(trades.slice(0, 2), { priceSol: 0.1, sellFeeBps: 0, peaks: peaksAfter(trades) });
    // after the sell someone paid 0.1 a token: 100 tokens would have fetched 10
    expect(p.missedSol).toBeCloseTo(8);
  });
});

describe('leaderboard', () => {
  it('ranks traders by profit', () => {
    const A = 'A'.repeat(32);
    const B = 'B'.repeat(32);
    const rows = leaderboard([tr('buy', 100, 1, 1, A), tr('buy', 100, 1, 2, B), tr('sell', 100, 3, 3, B)], 0.01, 0);
    expect(rows.map((r) => r.trader)).toEqual([B, A]);
    expect(placement(5, rows)).toBe(1);
    expect(placement(0.5, rows)).toBe(2);
    expect(placement(-1, rows)).toBe(3);
  });
});

describe('priceSeries', () => {
  it('keeps the all-time high when it thins the line', () => {
    const trades = Array.from({ length: 2000 }, (_, i) => tr('buy', 1, i === 777 ? 99 : 1 + (i % 7) / 100, i));
    const s = priceSeries(trades, 100);
    expect(s.length).toBeLessThanOrEqual(102);
    expect(Math.max(...s.map((p) => p[1]))).toBe(99);
    expect(s[0]![0]).toBe(0);
  });
});

describe('simulate', () => {
  const series: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 4],
    [3, 3],
  ];
  it('buys at the entry and sells at the exit, fees taken', () => {
    const r = simulate({ series, entry: 0, exit: 3, sol: 1, buyFeeBps: 1000, sellFeeBps: 0 });
    expect(r.tokens).toBeCloseTo(0.9);
    expect(r.out).toBeCloseTo(2.7);
    expect(r.pnl).toBeCloseTo(1.7);
    expect(r.bestOut).toBeCloseTo(3.6);
    expect(r.bestTs).toBe(2);
    expect(r.path).toHaveLength(4);
  });
  it('refuses an exit before the entry', () => {
    expect(simulate({ series, entry: 2, exit: 1, sol: 1, buyFeeBps: 0, sellFeeBps: 0 }).ok).toBe(false);
  });
});

describe('rankOf', () => {
  it('maps returns to titles', () => {
    expect(rankOf(-0.9)).toBe('exit-liquidity');
    expect(rankOf(0)).toBe('breakeven');
    expect(rankOf(0.5)).toBe('profit-taker');
    expect(rankOf(12)).toBe('oracle');
    expect(rankOf(null)).toBe('breakeven');
  });
});
