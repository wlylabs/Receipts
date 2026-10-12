import { describe, expect, it } from 'vitest';
import { paperHook, paperVerdict, walletHook, walletVerdict } from './story';

const base = { entry: 5, athIdx: 20, dipIdx: 30, holdNow: true, usd: 100 };
const $ = (n: number) => `$${Math.round(n)}`;

describe('paper trade words', () => {
  it('hooks on where the buy was', () => {
    expect(paperHook({ ...base, entry: 0, roi: 0, out: 0, bestOut: 0 }, 'Oct 07')).toBe('bought at launch →');
    expect(paperHook({ ...base, entry: 20, roi: 0, out: 0, bestOut: 0 }, 'Oct 07')).toBe('bought the top →');
    expect(paperHook({ ...base, roi: 0, out: 0, bestOut: 0 }, 'Oct 07')).toBe('bought Oct 07 →');
  });
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
  it('hooks on how much it played', () => {
    expect(walletHook(w, $)).toBe('3 buys, 2 sells →');
    expect(walletHook({ ...w, sells: 0 }, $)).toBe('put in $500 →');
  });
  it('says how it went', () => {
    expect(walletVerdict({ ...w, pnl: 50, roi: 0.1, missedUsd: 400 }, $)).toBe('Up, but sold $400 before the top');
    expect(walletVerdict({ ...w, pnl: 1000, roi: 2 }, $)).toBe('3x on what went in');
    expect(walletVerdict({ ...w, pnl: -100, roi: -0.2, unrealized: -100, openValue: 300 }, $)).toBe('Still holding the bag');
    expect(walletVerdict({ ...w, pnl: -100, roi: -0.2 }, $)).toBe('Paid the market');
  });
});
