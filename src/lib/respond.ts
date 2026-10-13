import 'server-only';
import type { ApiError } from './types';
import { hit } from './throttle';

export const CACHED = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

export function ok(body: unknown) {
  return Response.json(body, { headers: { 'Cache-Control': CACHED } });
}

export function fail(code: ApiError['code'], error: string, headers: Record<string, string> = {}) {
  const status = code === 'invalid' ? 400 : code === 'upstream' ? 502 : code === 'busy' ? 429 : 404;
  const cache = code === 'upstream' || code === 'busy' ? 'no-store' : CACHED;
  return Response.json({ code, error } satisfies ApiError, { status, headers: { 'Cache-Control': cache, ...headers } });
}

/**
 * Turns away a caller asking too often, before any upstream is asked: the free sources behind
 * Receipts are shared by everyone, so one script must not use them up. Null lets the call through.
 */
export function tooMany(req: Request, bucket: string, perMinute: number): Response | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
  const wait = hit(`${bucket}:${ip}`, perMinute);
  return wait > 0 ? fail('busy', `Too many lookups from here. Try again in ${wait} s.`, { 'Retry-After': String(wait) }) : null;
}
