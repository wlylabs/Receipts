import { cleanAddress, isAddress, isWallet } from './receipts';
import { ROUTES } from './site';

/** What the paste box takes: a token's CA or a wallet. */
export type PasteMode = 'token' | 'wallet';

export const MODES: Record<PasteMode, { tab: string; short: string; placeholder: string; empty: string }> = {
  token: { tab: 'Check a coin', short: 'CA', placeholder: 'Drop the CA…', empty: 'Drop a coin’s contract address (CA).' },
  wallet: { tab: 'Stalk a wallet', short: 'Wallet', placeholder: 'Drop a wallet to stalk…', empty: 'Drop a wallet address.' },
};

/** Where a pasted address goes in this mode, or why it can't. */
export function routeFor(mode: PasteMode, raw: string): { to: string } | { error: string } {
  const a = cleanAddress(raw);
  if (!a) return { error: MODES[mode].empty };
  if (!isAddress(a)) return { error: 'That doesn’t look like a Solana or 0x address.' };
  if (mode === 'token') return { to: ROUTES.token(a) };
  // a 64-character 0x is a pool or a transaction, never a wallet
  if (!isWallet(a)) return { error: 'That isn’t a wallet address. Is it a coin? Switch to Check a coin.' };
  return { to: ROUTES.wallet(a) };
}
