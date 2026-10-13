import { describe, expect, it } from 'vitest';
import { lamportsFor, pays, readQuote, received, shown, signQuote, type PayTx, type Quote } from './payment';
import { USDC_MINT } from './solanaTx';

const ME = 'Hx6LbkMHe69DYawhPyVNs8Apa6tyfogfzQV6a7XkwBUU';
const q: Quote = { ref: 'Ref1111111111111111111111111111111111111111', coin: 'USDC', amount: '1000000', exp: 1_000 };

describe('quotes', () => {
  it('reads back only what was signed with the secret', () => {
    const t = signQuote(q, 's3cret');
    expect(readQuote(t, 's3cret')).toEqual(q);
    expect(readQuote(t, 'other')).toBeNull();
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...q, amount: '1' })).toString('base64url');
    expect(readQuote(`${forged}.${sig}`, 's3cret')).toBeNull();
    expect(readQuote(body!, 's3cret')).toBeNull();
    expect(readQuote('junk', 's3cret')).toBeNull();
  });

  it('shows amounts plainly', () => {
    expect(shown({ coin: 'USDC', amount: '1000000' })).toBe('1');
    expect(shown({ coin: 'USDC', amount: '2500000' })).toBe('2.5');
    expect(shown({ coin: 'SOL', amount: '6120000' })).toBe('0.00612');
  });

  it('prices SOL up to the next hundred-thousandth', () => {
    expect(lamportsFor(1, 160)).toBe(6_250_000n);
    expect(lamportsFor(1, 150)).toBe(6_670_000n);
  });
});

const usdcTx = (pre: string, post: string, blockTime = 900, err: unknown = null): PayTx => ({
  blockTime,
  meta: {
    err,
    preTokenBalances: [{ mint: USDC_MINT, owner: ME, uiTokenAmount: { amount: pre } }],
    postTokenBalances: [{ mint: USDC_MINT, owner: ME, uiTokenAmount: { amount: post } }],
  },
});

describe('payments', () => {
  it('counts USDC that reached the recipient', () => {
    expect(received(usdcTx('5000000', '6000000'), 'USDC', ME)).toBe(1_000_000n);
    expect(pays(usdcTx('5000000', '6000000'), q, ME)).toBe(true);
    // a new account has no balance before
    expect(pays({ blockTime: 900, meta: { err: null, postTokenBalances: [{ mint: USDC_MINT, owner: ME, uiTokenAmount: { amount: '1000000' } }] } }, q, ME)).toBe(true);
  });

  it('turns away short, failed, late or misdirected payments', () => {
    expect(pays(usdcTx('0', '999999'), q, ME)).toBe(false);
    expect(pays(usdcTx('0', '1000000', 900, { InstructionError: [0, 'x'] }), q, ME)).toBe(false);
    expect(pays(usdcTx('0', '1000000', 2_000), q, ME)).toBe(false);
    expect(pays(usdcTx('0', '1000000'), q, 'Someone1111111111111111111111111111111111111')).toBe(false);
  });

  it('counts SOL by the recipient’s balance', () => {
    const sol: Quote = { ...q, coin: 'SOL', amount: '6250000' };
    const tx = (gain: number): PayTx => ({ blockTime: 900, transaction: { message: { accountKeys: [{ pubkey: 'Payer' }, { pubkey: ME }] } }, meta: { err: null, preBalances: [1e9, 5e8], postBalances: [1e9 - gain - 5000, 5e8 + gain] } });
    expect(pays(tx(6_250_000), sol, ME)).toBe(true);
    expect(pays(tx(6_000_000), sol, ME)).toBe(false);
  });
});
