import { cleanAddress, isAddress, isWallet } from './receipts';
import { ROUTES } from './site';

/** What the paste box takes: a token's CA or a wallet. */
export type PasteMode = 'token' | 'wallet';

export const MODES: Record<PasteMode, { tab: string; short: string; placeholder: string; empty: string }> = {
  token: { tab: 'Token CA', short: 'CA', placeholder: 'Paste a token CA…', empty: 'Paste a token’s contract address.' },
  wallet: { tab: 'Wallet', short: 'Wallet', placeholder: 'Paste a wallet address…', empty: 'Paste a wallet address.' },
};

/** Where a pasted address goes in this mode, or why it can't. */
export function routeFor(mode: PasteMode, raw: string): { to: string } | { error: string } {
  const a = cleanAddress(raw);
  if (!a) return { error: MODES[mode].empty };
  if (!isAddress(a)) return { error: 'That doesn’t look like a Solana or 0x address.' };
  if (mode === 'token') return { to: ROUTES.token(a) };
  // a 64-character 0x is a pool or a transaction, never a wallet
  if (!isWallet(a)) return { error: 'That isn’t a wallet address. Is it a token? Switch to Token CA.' };
  return { to: ROUTES.wallet(a) };
}
