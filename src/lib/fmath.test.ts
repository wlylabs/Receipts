import { describe, expect, it } from 'vitest';
import { originOf, profitLink, tokenPlug, traderPlug } from './fmath';
import type { PositionCalc, TokenInfo } from './types';

const ORIGIN = 'https://fmath.example';

const token: TokenInfo = {
  chain: 'solana',
  chainName: 'Solana',
  address: 'Mint111',
  pair: 'Pair111',
  dex: 'raydium',
  quoteSymbol: 'SOL',
  name: 'Dog',
  symbol: 'DOG',
  image: null,
  priceUsd: 0.001,
  mcapUsd: 1_000_000,
  liquidityUsd: null,
  volume24hUsd: null,
  change24h: null,
  createdAt: null,
  url: '',
};

const position = (p: Partial<PositionCalc>): PositionCalc => ({
  buys: 2,
  sells: 1,
  usdIn: 400,
  usdOut: 300,
  tokensIn: 1_000_000,
  tokensOut: 1_000_000,
  open: 0,
  openValue: 0,
  realized: -100,
  unrealized: 0,
  pnl: -100,
  roi: -0.25,
  unknownSold: 0,
  sent: 0,
  received: 0,
  feesUsd: 0,
  missedUsd: 0,
  firstTs: 0,
  lastTs: 0,
  ...p,
});

describe('originOf', () => {
  it('takes a bare domain or a full URL, and nothing without one', () => {
    expect(originOf('fmath.vercel.app')).toBe('https://fmath.vercel.app');
    expect(originOf(' https://fmath.app/fee/ ')).toBe('https://fmath.app');
    expect(originOf(undefined)).toBeNull();
    expect(originOf('not a url at all')).toBeNull();
  });
});

describe('profitLink', () => {
  it('fills the token, a typeable buy size and the entry market cap', () => {
    const url = new URL(profitLink(ORIGIN, token, { buy: 1234.5, entryMcap: 400_000.4 }));
    expect(url.pathname).toBe('/profit/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      chain: 'solana',
      token: 'solana:Mint111',
      buy: '1200',
      entryMcap: '400000',
      source: 'receipts',
    });
  });

  it('leaves out the token lookup on a chain FMath cannot look up', () => {
    const url = new URL(profitLink(ORIGIN, { chain: 'robinhood', address: '0xabc' }, { buy: 42.4 }));
    expect(url.searchParams.get('token')).toBeNull();
    expect(url.searchParams.get('buy')).toBe('42');
  });
});

describe('tokenPlug', () => {
  it('pitches the buy decision on a fomo chain', () => {
    const plug = tokenPlug(token, ORIGIN)!;
    expect(plug.title).toBe('Thinking of buying $DOG at $1M?');
    expect(new URL(plug.href).searchParams.get('entryMcap')).toBe('1000000');
  });

  it('stays quiet without FMath or off fomo’s chains', () => {
    expect(tokenPlug(token, null)).toBeNull();
    expect(tokenPlug({ ...token, chain: 'arbitrum' }, ORIGIN)).toBeNull();
  });
});

describe('traderPlug', () => {
  it('answers selling early with an exit plan', () => {
    expect(traderPlug(token, position({ missedUsd: 500, pnl: 50 }), ORIGIN)!.cta).toBe('Plan the exits');
  });

  it('answers a loss with break-even, at the wallet’s own size and entry', () => {
    const plug = traderPlug(token, position({}), ORIGIN)!;
    expect(plug.cta).toBe('Check break-even');
    expect(plug.body).toContain('$100');
    const q = new URL(plug.href).searchParams;
    expect(q.get('buy')).toBe('200');
    // $400 for 1M tokens is $0.0004 each, times the 1B supply
    expect(q.get('entryMcap')).toBe('400000');
  });

  it('blames a tiny loss on fees, not on the call', () => {
    const plug = traderPlug(token, position({ pnl: -0.5, usdIn: 50 }), ORIGIN)!;
    expect(plug.title).toBe('Fees ate this one.');
    expect(plug.body).toContain('$25.00 buy');
  });

  it('answers an open winning bag with a target', () => {
    const plug = traderPlug(token, position({ pnl: 300, open: 500_000, openValue: 500, sells: 0 }), ORIGIN)!;
    expect(plug.cta).toBe('Set a target');
  });

  it('answers a closed win with the next entry', () => {
    expect(traderPlug(token, position({ pnl: 200 }), ORIGIN)!.cta).toBe('Open FMath');
  });
});
