import { describe, expect, it } from 'vitest';
import { marketVerdict, paperVerdict, sinceLaunch, walletVerdict } from './story';

const base = { holdNow: true, usd: 100 };
const $ = (n: number) => `$${Math.round(n)}`;

describe('paper trade words', () => {
  it('says how it went', () => {
    expect(paperVerdict({ ...base, roi: 9, out: 1000, bestOut: 1050 })).toBe('10x and sold near the top');
    expect(paperVerdict({ ...base, roi: 2, out: 300, bestOut: 1200 })).toBe('3x, but it was 12x at the top');
    expect(paperVerdict({ ...base, roi: -0.4, out: 60, bestOut: 500 })).toBe('Was 5x up, ended down 40%');
    expect(paperVerdict({ ...base, roi: -0.8, out: 20, bestOut: 110 })).toBe('Held through −80%');
    expect(paperVerdict({ ...base, roi: 0.2, out: 120, bestOut: 125 })).toBe('Up 20%');
  });
});

describe('wallet words', () => {
  const w = { buys: 3, sells: 2, usdIn: 500, pnl: 0, roi: 0, realized: 0, unrealized: 0, openValue: 0, missedUsd: 0 };
  it('says how it went', () => {
    expect(walletVerdict({ ...w, pnl: 50, roi: 0.1, missedUsd: 400 }, $)).toBe('Up, but sold $400 before the top');
    expect(walletVerdict({ ...w, pnl: 1000, roi: 2 }, $)).toBe('3x on what went in');
    expect(walletVerdict({ ...w, pnl: -100, roi: -0.2, unrealized: -100, openValue: 300 }, $)).toBe('Still holding the bag');
    expect(walletVerdict({ ...w, pnl: -100, roi: -0.2 }, $)).toBe('Paid the market');
  });
});

describe('market words', () => {
  it('says how the run went', () => {
    expect(marketVerdict({ launch: 1, now: 41, ath: 42 })).toBe('41x since launch, at the top');
    expect(marketVerdict({ launch: 1, now: 5, ath: 20 })).toBe('5x since launch, 75% off the top');
    expect(marketVerdict({ launch: 1, now: 1.2, ath: 8 })).toBe('Was 8x, gave most of it back');
    expect(marketVerdict({ launch: 1, now: 0.3, ath: 6 })).toBe('Was 6x, now under its launch');
    expect(marketVerdict({ launch: 1, now: 0.6, ath: 1.1 })).toBe('Down 40% since launch');
  });
  it('says how far it came', () => {
    expect(sinceLaunch({ launch: 1, now: 42 })).toBe('42x');
    expect(sinceLaunch({ launch: 1, now: 1.5 })).toBe('+50%');
    expect(sinceLaunch({ launch: 1, now: 0.25 })).toBe('−75%');
  });
});
