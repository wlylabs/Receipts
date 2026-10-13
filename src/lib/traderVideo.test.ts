import { describe, expect, it } from 'vitest';
import { tradesCsv, traderStory } from './traderVideo';
import { position } from './receipts';
import { timeOf } from './replayVideo';
import type { Candle } from './candles';
import type { Trade, TraderReceipts } from './types';

// runs from 1 to 100 by candle 40, then bleeds out to 5
const candles: Candle[] = Array.from({ length: 60 }, (_, i) => {
  const p = i <= 40 ? 100 ** (i / 40) : 100 * 0.05 ** ((i - 40) / 19);
  return [1000 + i * 60, p, p * 1.001, p * 0.999, p];
});
const at = (i: number) => candles[i]![4];

function receipts(raw: TraderReceipts['trades']): TraderReceipts {
  const trades: Trade[] = raw.map(([ts, side, tokens, usd, priceUsd, tx]) => ({ ts, side, tokens, usd, priceUsd, tx, trader: 'w' }));
  return {
    kind: 'trader',
    owner: 'So1anaWa11et',
    token: { symbol: 'PEPE', chainName: 'Solana', priceUsd: 5, mcapUsd: 5_000_000, createdAt: 1000 },
    position: position(trades, 5),
    trades: raw,
    series: candles.map(([ts, , , , c]) => [ts, c]),
    candles,
    candle: '1m',
    place: 1,
    of: 1,
    source: 'chain',
    complete: true,
  } as unknown as TraderReceipts;
}

const trade = (i: number, side: 'buy' | 'sell', tokens: number): TraderReceipts['trades'][number] => [1000 + i * 60, side, tokens, tokens * at(i), at(i), `tx${i}`];

describe('trader video story', () => {
  it('tells the way in, the biggest add and the way out, with what each sell made', () => {
    const { video } = traderStory(receipts([trade(2, 'buy', 100), trade(12, 'buy', 50), trade(30, 'sell', 75), trade(40, 'sell', 75)]));
    const texts = video.captions.map((c) => c.text);
    expect(texts[0]).toMatch(/^In at /);
    expect(texts.some((t) => t.startsWith('Added '))).toBe(true);
    expect(texts.at(-1)).toMatch(/^Out at [^·]+$/);
    expect(video.captions.at(-1)?.tone).toBe('pos');
    expect(video.captions.length).toBeLessThanOrEqual(5);
    const when = video.captions.map((c) => timeOf(Math.max(c.ts, video.from), video, 'story'));
    for (let i = 1; i < when.length; i++) expect(when[i]! - when[i - 1]!).toBeGreaterThanOrEqual(1.4);
    expect(video.pops?.map((p) => p.tone)).toEqual(['pos', 'pos']);
    expect(video.pops?.[1]?.text).toMatch(/^\+\$.* · \d+(\.\d)?×$/);
    for (const p of video.pops ?? []) expect(video.markers.some((m) => m.ts === p.ts && m.kind === 'sell')).toBe(true);
    // the long cut also says what each buy put in, and closes on the receipt with the rank stamped
    expect(video.notes?.length).toBeGreaterThan(0);
    for (const n of video.notes ?? []) expect(video.markers.some((m) => m.ts === n.ts && m.kind === 'buy')).toBe(true);
    expect(video.notes?.[0]?.text).toMatch(/^\$.* in$/);
    expect(video.outro?.stamp?.tone).toBe('pos');
    expect(video.outro?.lines.length).toBeGreaterThan(0);
  });

  it('calls the paper top it gave back, and the bag still held', () => {
    const { video } = traderStory(receipts([trade(2, 'buy', 100)]));
    const texts = video.captions.map((c) => c.text);
    expect(texts.some((t) => /^Up \d+× on paper$/.test(t))).toBe(true);
    expect(texts.at(-1)).toMatch(/^Still holding /);
    expect(video.pops).toEqual([]);
  });

  it('marks a sell at a loss in red', () => {
    const { video } = traderStory(receipts([trade(40, 'buy', 10), trade(55, 'sell', 10)]));
    expect(video.pops?.[0]?.tone).toBe('neg');
    expect(video.captions.at(-1)?.tone).toBe('neg');
    expect(video.captions.map((c) => c.text).some((t) => t.includes('on paper'))).toBe(false);
  });
});

describe('trades as CSV', () => {
  it('writes a header and one row per trade, quoting what needs it', () => {
    const r = receipts([
      [1000, 'buy', 10, 20, 2, 'tx,1', 'swap', 'exact', 0.01],
      [1060, 'sell', 4, 12, 3, 'tx2', 'transfer', 'candle', 0],
    ]);
    const lines = tradesCsv(r).trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^time_utc,side,kind/);
    expect(lines[1]).toContain('"tx,1"');
    expect(lines[1]).toContain('1970-01-01T00:16:40.000Z,buy,swap,10,20,2,trade,0.01');
    expect(lines[2]).toContain('sell,transfer,4,12,3,chart,0,tx2');
  });
});
