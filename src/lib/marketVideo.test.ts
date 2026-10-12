import { describe, expect, it } from 'vitest';
import { marketStory } from './marketVideo';
import type { Candle } from './candles';
import type { TokenReceipts } from './types';

// launches at 1, runs to 100 by candle 40, then bleeds out to 5
const candles: Candle[] = Array.from({ length: 60 }, (_, i) => {
  const p = i <= 40 ? 100 ** (i / 40) : 100 * 0.05 ** ((i - 40) / 19);
  return [1000 + i * 60, p, p * 1.001, p * 0.999, p];
});

const r = {
  kind: 'token',
  token: { symbol: 'PEPE', chainName: 'Solana', priceUsd: 5, mcapUsd: 5_000_000, liquidityUsd: 100_000, change24h: -10, createdAt: 1000 },
  series: candles.map(([ts, , , , c]) => [ts, c]),
  candles,
  candle: '1m',
  ath: { ts: 1000 + 40 * 60, priceUsd: 100.1 },
  window: { buys: 10, sells: 10 },
  board: [],
} as unknown as TokenReceipts;

describe('market video', () => {
  const s = marketStory(r, 1000 + 86_400)!;
  it('runs launch to now on every candle', () => {
    expect(s.video.from).toBe(1000);
    expect(s.video.to).toBe(1000 + 60 * 60);
    expect(s.video.candles).toHaveLength(60);
    expect(s.video.counter?.(s.video.to)).toBe('$5M MC');
    expect(s.video.verdict).toBe('5x since launch, 95% off the top');
    expect(s.video.roiText).toBe('5x');
  });
  it('calls out launch, the highs, the top and the way down, in order', () => {
    const texts = s.video.captions.map((c) => c.text);
    expect(texts[0]).toBe('Launched at $1M MC');
    expect(texts).toContain('All-time high · $100M MC');
    expect(texts.at(-1)).toMatch(/^90% off the top/);
    expect(texts.length).toBeLessThanOrEqual(8);
    expect(s.video.captions.map((c) => c.ts)).toEqual([...s.video.captions.map((c) => c.ts)].sort((a, b) => a - b));
  });
  it('needs a chart to make one', () => {
    expect(marketStory({ ...r, candles: candles.slice(0, 1) })).toBeNull();
  });
});
