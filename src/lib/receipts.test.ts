import { describe, expect, it } from 'vitest';
import { cleanAddress, isAddress, movesToTrades, priceAt, leaderboard, peakAfter, placement, position, rankOf, sameAddress, simulate, toSeries, toTrades } from './receipts';
import type { GtTrade, Trade } from './types';

const SOL = '2eZJN9uAvrsYjcx45xph2dZAyAsX6oLDpgVzsNNSKxQr';
const EVM = '0x4200000000000000000000000000000000000006';
let n = 0;
const tr = (side: 'buy' | 'sell', tokens: number, usd: number, ts: number, trader = SOL): Trade => ({ tx: `t${n++}`, ts, trader, side, tokens, usd, priceUsd: usd / tokens });

describe('addresses', () => {
  it('pulls the address out of a pasted link', () => {
    expect(cleanAddress(`https://dexscreener.com/solana/${SOL}?ref=x`)).toBe(SOL);
    expect(cleanAddress(`https://dexscreener.com/base/${EVM.toUpperCase().replace('0X', '0x')}`)).toBe(EVM.toUpperCase().replace('0X', '0x'));
    expect(isAddress(EVM)).toBe(true);
    expect(isAddress('nope')).toBe(false);
  });
  it('compares EVM addresses without case', () => {
    expect(sameAddress(EVM, EVM.toUpperCase().replace('0X', '0x'))).toBe(true);
    expect(sameAddress(SOL, SOL.toLowerCase())).toBe(false);
  });
});

describe('toTrades', () => {
  const T = 'TokenTokenTokenTokenTokenTokenTokenTo';
  const raw = (from: string, to: string, fromAmt: string, toAmt: string, usd: string, at: string): GtTrade => ({
    attributes: { tx_hash: at, tx_from_address: SOL, block_timestamp: at, from_token_address: from, to_token_address: to, from_token_amount: fromAmt, to_token_amount: toAmt, volume_in_usd: usd },
  });
  it('reads buys and sells of the token by which side it is on, oldest first', () => {
    const t = toTrades(
      [raw(T, 'So1', '500', '1', '150', '2026-10-12T10:00:00Z'), raw('So1', T, '1', '1000', '150', '2026-10-12T09:00:00Z'), raw('A', 'B', '1', '1', '1', '2026-10-12T08:00:00Z')],
      T,
    );
    expect(t.map((x) => x.side)).toEqual(['buy', 'sell']);
    expect(t[0]!.tokens).toBe(1000);
    expect(t[1]!.priceUsd).toBeCloseTo(0.3);
  });
});

describe('toSeries', () => {
  it('orders candles and keeps the top', () => {
    const { series, ath } = toSeries([
      [300, 2, 2.5, 1.9, 2.2, 10],
      [200, 1, 9, 1, 2, 10],
      [100, 1, 1.2, 0.9, 1, 10],
    ]);
    expect(series.map((p) => p[0])).toEqual([100, 200, 300]);
    expect(ath).toEqual({ ts: 200, priceUsd: 9 });
    expect(series[1]).toEqual([200, 9]);
  });
});

describe('position', () => {
  it('splits realized and open profit', () => {
    const p = position([tr('buy', 1000, 100, 1), tr('sell', 500, 150, 2)], 0.2);
    expect(p.realized).toBeCloseTo(100);
    expect(p.open).toBe(500);
    expect(p.unrealized).toBeCloseTo(50);
    expect(p.pnl).toBeCloseTo(150);
    expect(p.roi).toBeCloseTo(1.5);
    expect(p.unknownSold).toBe(0);
  });
  it('leaves tokens bought before the window out of the P&L', () => {
    const p = position([tr('buy', 100, 10, 1), tr('sell', 300, 60, 2)], 1);
    expect(p.unknownSold).toBe(200);
    expect(p.pnl).toBeCloseTo(10);
  });
  it('prices the paper hands against the top after each sell', () => {
    const trades = [tr('buy', 100, 100, 1), tr('sell', 100, 200, 2)];
    const p = position(trades, 1, peakAfter([[5, 10]], trades));
    expect(p.missedUsd).toBeCloseTo(800);
  });
});

describe('leaderboard', () => {
  it('ranks wallets by profit and merges EVM case', () => {
    const rows = leaderboard([tr('buy', 100, 100, 1, EVM), tr('sell', 100, 300, 2, EVM.toUpperCase().replace('0X', '0x')), tr('buy', 100, 100, 3, SOL)], 1);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.pnl).toBeCloseTo(200);
    expect(placement(500, rows)).toBe(1);
    expect(placement(-1, rows)).toBe(3);
  });
});

describe('simulate', () => {
  const series: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 4],
    [3, 3],
  ];
  it('buys at the entry and sells at the exit', () => {
    const r = simulate({ series, entry: 0, exit: 3, usd: 100 });
    expect(r.out).toBeCloseTo(300);
    expect(r.bestOut).toBeCloseTo(400);
    expect(r.path).toHaveLength(4);
  });
  it('sells at the live price when holding to now', () => {
    expect(simulate({ series, entry: 0, exit: 3, usd: 100, holdNow: true, nowPrice: 5 }).out).toBeCloseTo(500);
  });
  it('refuses an exit before the entry', () => {
    expect(simulate({ series, entry: 2, exit: 1, usd: 1 }).ok).toBe(false);
  });
});

describe('rankOf', () => {
  it('maps returns to titles', () => {
    expect(rankOf(-0.9)).toBe('exit-liquidity');
    expect(rankOf(0.5)).toBe('profit-taker');
    expect(rankOf(null)).toBe('breakeven');
  });
});

describe('priceAt', () => {
  const s: [number, number][] = [
    [100, 1],
    [200, 2],
    [300, 3],
  ];
  it('takes the last close at or before the time', () => {
    expect(priceAt(s, 250, 9)).toBe(2);
    expect(priceAt(s, 50, 9)).toBe(1);
    expect(priceAt(s, 300, 9)).toBe(3);
    expect(priceAt(s, 99_999, 9)).toBe(9);
  });
  it('turns balance changes into priced buys and sells', () => {
    const t = movesToTrades([{ tx: 'a', ts: 210, delta: 10 }, { tx: 'b', ts: 310, delta: -4 }], SOL, s, 9);
    expect(t.map((x) => [x.side, x.tokens, x.usd])).toEqual([
      ['buy', 10, 20],
      ['sell', 4, 12],
    ]);
  });
});
