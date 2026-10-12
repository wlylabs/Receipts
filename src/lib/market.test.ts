import { describe, expect, it } from 'vitest';
import { marketOf } from './market';

const base = { priceUsd: 1, athUsd: 4, change24h: 0, buys: 10, sells: 10 };

describe('marketOf', () => {
  it('calls a token near its top', () => {
    expect(marketOf({ ...base, priceUsd: 3.8 }).label).toBe('At the top');
  });
  it('reads a big day either way', () => {
    expect(marketOf({ ...base, change24h: 40 }).label).toBe('Pumping');
    expect(marketOf({ ...base, change24h: -30 }).tone).toBe('neg');
  });
  it('measures the drop from the top', () => {
    const m = marketOf({ ...base, priceUsd: 0.2 });
    expect(m.fromAth).toBeCloseTo(-0.95);
    expect(m.label).toBe('Far off the top');
  });
  it('reads who is trading', () => {
    expect(marketOf({ ...base, buys: 30, sells: 10 }).label).toBe('Buyers in control');
    expect(marketOf({ ...base, buys: 5, sells: 20 }).buyShare).toBeCloseTo(0.2);
  });
  it('is sideways with nothing going on', () => {
    expect(marketOf({ ...base, change24h: null, buys: 0, sells: 0 })).toMatchObject({ label: 'Sideways', buyShare: null });
  });
});
