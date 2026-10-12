export const SITE_NAME = 'Receipts';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://receipts.vercel.app').replace(/\/$/, '');
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');
export const SITE_TITLE = 'Receipts — pull the receipts on any DexScreener token or trader';
export const SITE_DESCRIPTION =
  'Paste a token CA to ape into its real chart and see where you would rank among its latest traders, or paste a wallet and call it — profit or rekt — before its real receipt prints.';

export const ROUTES = {
  home: '/',
  trader: (a: string, ca: string) => `/trader/${a}/?ca=${encodeURIComponent(ca)}`,
  token: (ca: string) => `/token/${ca}/`,
};
