import { describe, expect, it } from 'vitest';
import { readMove, type Tx } from './solana';
import { balancesFrom, explorerFor, historyChains, readMoves, type TokenTx } from './evm';
import { closeAt, toBars } from './quotes';
import { hit, pacer } from './throttle';

const OWNER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const MINT = 'MintMintMintMintMintMintMintMintMintMintMin';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const bal = (mint: string, amount: number, owner = OWNER) => ({ mint, owner, uiTokenAmount: { uiAmountString: String(amount), uiAmount: amount } });

describe('solana transactions', () => {
  const tx = (pre: ReturnType<typeof bal>[], post: ReturnType<typeof bal>[], lamports: [number, number], payer = OWNER): Tx => ({
    blockTime: 1000,
    transaction: { message: { accountKeys: [{ pubkey: payer }, { pubkey: OWNER }].filter((k, i, a) => a.findIndex((x) => x.pubkey === k.pubkey) === i) } },
    meta: { err: null, fee: 5000, preBalances: [lamports[0], 0], postBalances: [lamports[1], 0], preTokenBalances: pre, postTokenBalances: post },
  });
  it('reads a buy paid in SOL, the network fee put back and kept apart', () => {
    const m = readMove(tx([], [bal(MINT, 1000)], [2e9, 1.5e9 - 5000]), 'sig', OWNER, MINT)!;
    expect(m).toMatchObject({ delta: 1000, kind: 'swap' });
    expect(m.native).toBeCloseTo(-0.5);
    expect(m.fee).toBeCloseTo(0.000005);
  });
  it('reads a sell for USDC', () => {
    const m = readMove(tx([bal(MINT, 1000), bal(USDC, 0)], [bal(MINT, 0), bal(USDC, 42)], [1e9, 1e9 - 5000]), 'sig', OWNER, MINT)!;
    expect(m).toMatchObject({ delta: -1000, kind: 'swap', stable: 42 });
  });
  it('calls tokens arriving with nothing paid a transfer', () => {
    const m = readMove(tx([], [bal(MINT, 5)], [1e9, 1e9], 'Sender1111111111111111111111111111111111111'), 'sig', OWNER, MINT)!;
    expect(m.kind).toBe('transfer');
    expect(m.fee).toBe(0);
  });
  it('skips transactions that failed or did not touch the token', () => {
    expect(readMove({ ...tx([], [bal(MINT, 5)], [1, 1]), meta: { err: 'x' } }, 's', OWNER, MINT)).toBeNull();
    expect(readMove(tx([bal(USDC, 1)], [bal(USDC, 2)], [1, 1]), 's', OWNER, MINT)).toBeNull();
  });
});

describe('evm transfers', () => {
  const me = '0x00000000000000000000000000000000000000aa';
  const token = '0x00000000000000000000000000000000000000bb';
  const pool = '0x00000000000000000000000000000000000000cc';
  const t = (hash: string, from: string, to: string, value: string, extra: Partial<TokenTx> = {}): TokenTx => ({ hash, timeStamp: '1000', from, to, value, contractAddress: token, tokenDecimal: '18', ...extra });
  const mine = [t('0x1', pool, me, '1000000000000000000000'), t('0x2', me, pool, '400000000000000000000'), t('0x3', '0x00000000000000000000000000000000000000dd', me, '5000000000000000000')];
  const legs = {
    tokens: [t('0x2', pool, me, '30000000', { contractAddress: '0xusdc', tokenSymbol: 'USDC', tokenDecimal: '6' })],
    txs: [{ hash: '0x1', from: me, to: pool, value: '500000000000000000', gasUsed: '100000', gasPrice: '1000000000' }],
    internal: [],
    from: 0,
  };
  it('pairs each move with what went the other way in the same transaction', () => {
    const [buy, sell, gift] = readMoves(me, token, mine, legs);
    expect(buy).toMatchObject({ delta: 1000, kind: 'swap' });
    expect(buy!.native).toBeCloseTo(-0.5);
    expect(buy!.fee).toBeCloseTo(0.0001);
    expect(sell).toMatchObject({ delta: -400, kind: 'swap', stable: 30 });
    expect(gift).toMatchObject({ delta: 5, kind: 'transfer' });
  });
  it('calls a move older than the other lists reach a swap, unless it was minted', () => {
    const old = readMoves(me, token, [t('0x9', pool, me, '1'), t('0x8', '0x0000000000000000000000000000000000000000', me, '1')], { ...legs, from: 5000 });
    expect(old.map((m) => [m.tx, m.kind, m.native])).toEqual([
      ['0x9', 'swap', undefined],
      ['0x8', 'transfer', undefined],
    ]);
  });
  it('adds transfers up to balances', () => {
    expect(balancesFrom(me, mine)).toEqual([{ address: token, amount: 605 }]);
  });
  it('reads BNB Chain only with a key or an explorer set, Avalanche keyless, and prefers a key where one is set', () => {
    expect(explorerFor('bsc', {})).toBeNull();
    expect(explorerFor('bsc', { ETHERSCAN_API_KEY: 'k' })?.api).toContain('chainid=56');
    expect(explorerFor('avalanche', {})?.api).toContain('routescan');
    expect(explorerFor('base', {})?.api).toContain('blockscout');
    expect(explorerFor('base', { ETHERSCAN_API_KEY: 'k' })?.api).toContain('chainid=8453');
    expect(explorerFor('robinhood', { ETHERSCAN_API_KEY: 'k' })?.api).toContain('blockscout');
    expect(historyChains({})).not.toContain('bsc');
  });
});

describe('native prices', () => {
  it('reads bars and takes the one a time falls in', () => {
    const bars = toBars({ s: 'ok', t: [100, 200, 300], c: [1, 2, 3] });
    expect(closeAt(bars, 250)).toBe(2);
    expect(closeAt(bars, 50)).toBe(1);
    expect(toBars({ s: 'no_data' })).toEqual([]);
  });
});

describe('throttles', () => {
  it('lets a caller through up to the limit, then says how long to wait', () => {
    for (let i = 0; i < 3; i++) expect(hit('t:a', 3, 1000 + i)).toBe(0);
    expect(hit('t:a', 3, 2000)).toBe(59);
    expect(hit('t:a', 3, 61_001)).toBe(0);
    expect(hit('t:b', 3, 2000)).toBe(0);
  });
  it('lets a burst through, then gives up rather than wait too long', async () => {
    const wait = pacer(2, 10);
    await wait();
    await wait();
    await expect(wait()).rejects.toThrow('busy');
  });
});
