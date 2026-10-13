import { tooMany } from '../../lib/respond';
import { isOwnerKey, OWNER_COOKIE, ownerMark } from '../../lib/pay';

/**
 * The owner's own link: /owner/?key=OWNER_KEY marks this browser so its downloads are free,
 * /owner/?off signs it out. Anything else is a plain 404, so the page gives nothing away.
 */
export function GET(req: Request) {
  const limited = tooMany(req, 'owner', 10);
  if (limited) return limited;
  const url = new URL(req.url);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  const home = new URL('/', url);
  if (url.searchParams.has('off')) {
    return new Response(null, { status: 303, headers: { Location: home.href, 'Set-Cookie': `${OWNER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`, 'Cache-Control': 'no-store' } });
  }
  const mark = ownerMark();
  if (!mark || !isOwnerKey(url.searchParams.get('key') ?? '')) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(null, {
    status: 303,
    headers: { Location: home.href, 'Set-Cookie': `${OWNER_COOKIE}=${mark}; Path=/; Max-Age=${400 * 86_400}; HttpOnly; SameSite=Lax${secure}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
