export const SITE_NAME = 'Receipts';
export const SITE_URL = siteUrl(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL);

/**
 * The site's origin from whatever the environment holds: "receipts.app", "https://receipts.app/"
 * and " receipts.app " all work. Vercel's own production domain stands in when none is set; a
 * value that still isn't a URL falls back rather than failing the build.
 */
export function siteUrl(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v) return 'https://receipts.vercel.app';
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin;
  } catch {
    return 'https://receipts.vercel.app';
  }
}
export const SITE_TITLE = 'Receipts — paper-trade any token, replay any wallet';
export const SITE_DESCRIPTION =
  'Paste a token CA to paper-trade its real chart and see where you would rank among its traders, or paste a wallet, call it profit or rekt, and watch its real trades replay on the chart.';

export const ROUTES = {
  home: '/',
  wallet: (a: string) => `/wallet/${a}/`,
  trader: (a: string, ca: string) => `/wallet/${a}/?ca=${encodeURIComponent(ca)}`,
  token: (ca: string) => `/token/${ca}/`,
};
