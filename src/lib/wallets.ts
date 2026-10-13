import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';

/**
 * The Solana wallets in this browser (Phantom, Solflare, Backpack and the rest), found through
 * the Wallet Standard, and the two things asked of one: connect, then sign and send a payment.
 */

const CHAIN = 'solana:mainnet';

type Connect = { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }> };
type SignAndSend = { signAndSendTransaction: (...inputs: { account: WalletAccount; chain: string; transaction: Uint8Array }[]) => Promise<readonly { signature: Uint8Array }[]> };

const usable = (w: Wallet) => w.chains.includes(CHAIN) && 'standard:connect' in w.features && 'solana:signAndSendTransaction' in w.features;

/** The usable wallets now, and a way to hear of ones that register later. */
export function solanaWallets(onChange: (list: Wallet[]) => void): () => void {
  const api = getWallets();
  const emit = () => onChange(api.get().filter(usable));
  emit();
  const offs = [api.on('register', emit), api.on('unregister', emit)];
  return () => offs.forEach((off) => off());
}

/** The wallet's account to pay from, asking the person to connect if they haven't. */
export async function accountOf(w: Wallet): Promise<WalletAccount> {
  const has = w.accounts.find((a) => a.chains.includes(CHAIN)) ?? w.accounts[0];
  if (has) return has;
  const { accounts } = await (w.features['standard:connect'] as Connect).connect();
  const a = accounts.find((x) => x.chains.includes(CHAIN)) ?? accounts[0];
  if (!a) throw new Error('No account');
  return a;
}

/** Has the wallet sign and send a transaction built by the server. */
export async function signAndSend(w: Wallet, account: WalletAccount, base64: string): Promise<void> {
  const transaction = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await (w.features['solana:signAndSendTransaction'] as SignAndSend).signAndSendTransaction({ account, chain: CHAIN, transaction });
}
