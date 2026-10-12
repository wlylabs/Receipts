import 'server-only';
import type { ApiError } from './types';

export const CACHED = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

export function ok(body: unknown) {
  return Response.json(body, { headers: { 'Cache-Control': CACHED } });
}

export function fail(code: ApiError['code'], error: string) {
  const status = code === 'invalid' ? 400 : code === 'upstream' ? 502 : 404;
  const cache = code === 'upstream' ? 'no-store' : CACHED;
  return Response.json({ code, error } satisfies ApiError, { status, headers: { 'Cache-Control': cache } });
}
