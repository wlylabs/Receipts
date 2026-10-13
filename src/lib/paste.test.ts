import { describe, expect, it } from 'vitest';
import { routeFor } from './paste';

const SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const EVM = '0x1111111111111111111111111111111111111111';
const POOL = `0x${'ab'.repeat(32)}`;

describe('routeFor', () => {
  it('opens what the tab says, without guessing', () => {
    expect(routeFor('token', SOL)).toEqual({ to: `/?ca=${SOL}` });
    expect(routeFor('wallet', SOL)).toEqual({ to: `/?wallet=${SOL}` });
    expect(routeFor('wallet', `https://solscan.io/account/${EVM}`)).toEqual({ to: `/?wallet=${EVM}` });
  });

  it('takes a pool id as a token but never as a wallet', () => {
    expect(routeFor('token', POOL)).toEqual({ to: `/?ca=${POOL}` });
    expect(routeFor('wallet', POOL)).toHaveProperty('error');
  });

  it('says what to paste when there is nothing usable', () => {
    expect(routeFor('token', '  ')).toEqual({ error: 'Paste a token’s contract address.' });
    expect(routeFor('wallet', 'hello')).toHaveProperty('error');
  });
});
