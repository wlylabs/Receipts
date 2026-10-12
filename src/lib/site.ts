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
export const SITE_TITLE = 'Receipts — replay any wallet, make the video';
export const SITE_DESCRIPTION =
  'Paste a token CA to see its top gainers and biggest losers, or paste a wallet, then watch its real trades replay on the chart and turn them into a video.';

export const ROUTES = {
  home: '/',
  // everything lives on the one page; what it shows is in the query
  wallet: (a: string) => `/?wallet=${encodeURIComponent(a)}`,
  trader: (a: string, ca: string) => `/?wallet=${encodeURIComponent(a)}&ca=${encodeURIComponent(ca)}`,
  token: (ca: string) => `/?ca=${encodeURIComponent(ca)}`,
};
