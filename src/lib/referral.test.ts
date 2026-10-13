import { describe, expect, it } from 'vitest';
import { originOf, profitLink, referralUrl, tokenPlug, traderPlug } from './referral';
import type { PositionCalc, TokenInfo } from './types';

const ORIGIN = 'https://fmath.example';
const REF = 'https://fomo.family/r/willydetrade';
const LINKS = { referral: REF, fmath: ORIGIN };

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

describe('referralUrl', () => {
  it('defaults to the FMath referral, takes another, and turns off', () => {
    expect(referralUrl(undefined)).toBe(REF);
    expect(referralUrl('fomo.family/r/someone')).toBe('https://fomo.family/r/someone');
    expect(referralUrl(' OFF ')).toBeNull();
  });
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
  it('pitches the discount on the buy someone is weighing', () => {
    const plug = tokenPlug(token, LINKS)!;
    expect(plug.title).toBe('Buying $DOG at $1M? Pay 10% less to do it.');
    expect(plug.href).toBe(REF);
    expect(new URL(plug.calc!.href).searchParams.get('entryMcap')).toBe('1000000');
  });

  it('links only fomo without FMath, and stays quiet without the referral or off fomo’s chains', () => {
    expect(tokenPlug(token, { referral: REF, fmath: null })!.calc).toBeNull();
    expect(tokenPlug(token, { referral: null, fmath: ORIGIN })).toBeNull();
    expect(tokenPlug({ ...token, chain: 'arbitrum' }, LINKS)).toBeNull();
  });
});

describe('traderPlug', () => {
  const plug = (p: Partial<PositionCalc>) => traderPlug(token, position(p), LINKS)!;

  it('answers selling early with cheaper exits', () => {
    const it = plug({ missedUsd: 500, pnl: 50 });
    expect(it.title).toBe('Sold $500.00 before the top.');
    expect(it.calc!.cta).toBe('Plan the exits on FMath');
  });

  it('blames a tiny loss on fees', () => {
    expect(plug({ pnl: -0.5, usdIn: 50 }).title).toBe('Fees ate this one.');
  });

  it('answers a loss with the comeback, at the wallet’s own size and entry', () => {
    const it = plug({});
    expect(it.title).toBe('Down $100.00. Don’t pay full fees on the comeback.');
    expect(it.href).toBe(REF);
    const q = new URL(it.calc!.href).searchParams;
    expect(q.get('buy')).toBe('200');
    // $400 for 1M tokens is $0.0004 each, times the 1B supply
    expect(q.get('entryMcap')).toBe('400000');
  });

  it('answers an open bag with cheaper profit-taking', () => {
    expect(plug({ pnl: 300, open: 500_000, openValue: 500, sells: 0 }).calc!.cta).toBe('Set a target on FMath');
  });

  it('answers a closed win with the next one', () => {
    expect(plug({ pnl: 200 }).title).toBe('Up $200.00. Keep more of the next one.');
  });
});
