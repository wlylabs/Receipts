export const SITE_NAME = 'Receipts';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://receipts.vercel.app').replace(/\/$/, '');
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');
export const SITE_TITLE = 'Receipts — pull the receipts on any Bordrless trader or token';
export const SITE_DESCRIPTION =
  'Paste a wallet to print its real Bordrless P&L receipt and call it before it prints, or paste a token CA to ape into its real chart and see where you would rank among its traders.';

export const ROUTES = {
  home: '/',
  trader: (a: string) => `/trader/${a}/`,
  token: (ca: string) => `/token/${ca}/`,
};

export const bordrlessToken = (mint: string) => `https://bordrless.app/token/${mint}`;
export const solscanAccount = (a: string) => `https://solscan.io/account/${a}`;
export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
