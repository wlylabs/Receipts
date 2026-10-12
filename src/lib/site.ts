export const SITE_NAME = 'Receipts';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://receipts.vercel.app').replace(/\/$/, '');
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');
export const SITE_TITLE = 'Receipts — paper-trade any token, pull any wallet’s receipts';
export const SITE_DESCRIPTION =
  'Paste a token CA to paper-trade its real chart and see where you would rank among its traders, or paste a wallet and call it — profit or rekt — before its real receipt prints.';

export const ROUTES = {
  home: '/',
  wallet: (a: string) => `/wallet/${a}/`,
  trader: (a: string, ca: string) => `/wallet/${a}/?ca=${encodeURIComponent(ca)}`,
  token: (ca: string) => `/token/${ca}/`,
};
