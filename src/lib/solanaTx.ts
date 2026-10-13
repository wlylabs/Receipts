import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses';

/**
 * Just enough of Solana's wire format to build one payment: a legacy transaction with a SOL
 * transfer or a USDC transfer in it, unsigned, for the payer's wallet to sign and send.
 */

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;

export interface Key {
  pubkey: string;
  signer: boolean;
  writable: boolean;
}

export interface Instruction {
  program: string;
  keys: Key[];
  data: Uint8Array;
}

const bytesOf = (a: string) => getAddressEncoder().encode(address(a)) as Uint8Array;

/** Solana's "shortvec": seven bits a byte, the high bit set while more follow. */
export function shortVec(n: number): number[] {
  const out: number[] = [];
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    if (!n) return [...out, b];
    out.push(b | 0x80);
  }
}

const u64 = (v: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
};

/** The payer's or anyone's associated token account for a mint. */
export async function ata(owner: string, mint: string): Promise<string> {
  const [pda] = await getProgramDerivedAddress({ programAddress: address(ATA_PROGRAM), seeds: [bytesOf(owner), bytesOf(TOKEN_PROGRAM), bytesOf(mint)] });
  return pda;
}

/** SOL from `from` to `to`; the reference rides along read-only so the payment can be found by it. */
export function solTransfer(from: string, to: string, lamports: bigint, reference: string): Instruction {
  const data = new Uint8Array(12);
  new DataView(data.buffer).setUint32(0, 2, true);
  data.set(u64(lamports), 4);
  return {
    program: SYSTEM_PROGRAM,
    keys: [
      { pubkey: from, signer: true, writable: true },
      { pubkey: to, signer: false, writable: true },
      { pubkey: reference, signer: false, writable: false },
    ],
    data,
  };
}

/** Makes `owner`'s token account for `mint` if it isn't there yet, paid by `payer`. */
export function createAtaIdempotent(payer: string, account: string, owner: string, mint: string): Instruction {
  return {
    program: ATA_PROGRAM,
    keys: [
      { pubkey: payer, signer: true, writable: true },
      { pubkey: account, signer: false, writable: true },
      { pubkey: owner, signer: false, writable: false },
      { pubkey: mint, signer: false, writable: false },
      { pubkey: SYSTEM_PROGRAM, signer: false, writable: false },
      { pubkey: TOKEN_PROGRAM, signer: false, writable: false },
    ],
    data: new Uint8Array([1]),
  };
}

/** A token transfer that names its mint and decimals, so the wallet can show it plainly. */
export function tokenTransferChecked(source: string, mint: string, dest: string, owner: string, amount: bigint, decimals: number, reference: string): Instruction {
  const data = new Uint8Array(10);
  data[0] = 12;
  data.set(u64(amount), 1);
  data[9] = decimals;
  return {
    program: TOKEN_PROGRAM,
    keys: [
      { pubkey: source, signer: false, writable: true },
      { pubkey: mint, signer: false, writable: false },
      { pubkey: dest, signer: false, writable: true },
      { pubkey: owner, signer: true, writable: false },
      { pubkey: reference, signer: false, writable: false },
    ],
    data,
  };
}

/**
 * A legacy transaction, its one signature left blank: the accounts ordered signers first then the
 * rest, writable before read-only, the fee payer always first.
 */
export function compile(payer: string, blockhash: string, ixs: readonly Instruction[]): Uint8Array {
  const keys = new Map<string, { signer: boolean; writable: boolean }>([[payer, { signer: true, writable: true }]]);
  const add = (pubkey: string, signer: boolean, writable: boolean) => {
    const k = keys.get(pubkey);
    keys.set(pubkey, { signer: signer || !!k?.signer, writable: writable || !!k?.writable });
  };
  for (const ix of ixs) {
    for (const k of ix.keys) add(k.pubkey, k.signer, k.writable);
    add(ix.program, false, false);
  }
  const all = [...keys.entries()];
  const group = (signer: boolean, writable: boolean) => all.filter(([, k]) => k.signer === signer && k.writable === writable).map(([p]) => p);
  const order = [...group(true, true), ...group(true, false), ...group(false, true), ...group(false, false)];
  const index = new Map(order.map((p, i) => [p, i]));
  const signers = all.filter(([, k]) => k.signer).length;

  const out: number[] = [signers, group(true, false).length, group(false, false).length];
  out.push(...shortVec(order.length));
  for (const p of order) out.push(...bytesOf(p));
  out.push(...bytesOf(blockhash));
  out.push(...shortVec(ixs.length));
  for (const ix of ixs) {
    out.push(index.get(ix.program)!);
    out.push(...shortVec(ix.keys.length), ...ix.keys.map((k) => index.get(k.pubkey)!));
    out.push(...shortVec(ix.data.length), ...ix.data);
  }
  return new Uint8Array([...shortVec(signers), ...new Array<number>(64 * signers).fill(0), ...out]);
}
