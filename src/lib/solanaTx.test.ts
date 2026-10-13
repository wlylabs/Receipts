import { describe, expect, it } from 'vitest';
import { ata, compile, shortVec, solTransfer, SYSTEM_PROGRAM, USDC_MINT } from './solanaTx';

const PAYER = 'Hx6LbkMHe69DYawhPyVNs8Apa6tyfogfzQV6a7XkwBUU';
const TO = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const REF = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const HASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

describe('solana wire format', () => {
  it('writes shortvec lengths', () => {
    expect(shortVec(0)).toEqual([0]);
    expect(shortVec(127)).toEqual([0x7f]);
    expect(shortVec(128)).toEqual([0x80, 0x01]);
    expect(shortVec(16_383)).toEqual([0xff, 0x7f]);
  });

  it('lays out a SOL transfer: payer first, then writable, then read-only accounts', () => {
    const tx = compile(PAYER, HASH, [solTransfer(PAYER, TO, 6_250_000n, REF)]);
    // one blank signature
    expect(tx[0]).toBe(1);
    expect([...tx.slice(1, 65)].every((b) => b === 0)).toBe(true);
    const m = tx.slice(65);
    // 1 signer, 0 read-only signers, 2 read-only others (the reference and the program)
    expect([...m.slice(0, 3)]).toEqual([1, 0, 2]);
    expect(m[3]).toBe(4);
    const ix = m.slice(4 + 4 * 32 + 32);
    expect(ix[0]).toBe(1);
    // program 3 (system), accounts [payer, to, ref], data: 2u32 + lamports
    expect([...ix.slice(1, 6)]).toEqual([3, 3, 0, 1, 2]);
    expect(ix[6]).toBe(12);
    expect(new DataView(ix.buffer, ix.byteOffset + 7, 12).getUint32(0, true)).toBe(2);
    expect(new DataView(ix.buffer, ix.byteOffset + 11, 8).getBigUint64(0, true)).toBe(6_250_000n);
    expect(SYSTEM_PROGRAM).toHaveLength(32);
  });

  it('finds associated token accounts', async () => {
    // a well-known one: this owner's USDC account
    expect(await ata('Hx6LbkMHe69DYawhPyVNs8Apa6tyfogfzQV6a7XkwBUU', USDC_MINT)).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
});
