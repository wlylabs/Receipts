export const SITE_NAME = 'Receipts';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://receipts.vercel.app').replace(/\/$/, '');
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');
export const SITE_TITLE = 'Receipts — paper-trade any token, replay any wallet';
export const SITE_DESCRIPTION =
  'Paste a token CA to paper-trade its real chart and see where you would rank among its traders, or paste a wallet, call it profit or rekt, and watch its real trades replay on the chart.';

export const ROUTES = {
  home: '/',
  wallet: (a: string) => `/wallet/${a}/`,
  trader: (a: string, ca: string) => `/wallet/${a}/?ca=${encodeURIComponent(ca)}`,
  token: (ca: string) => `/token/${ca}/`,
};
