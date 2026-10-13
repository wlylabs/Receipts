/**
 * Two small rate limits kept in memory, so per server instance: enough for one deployment, and
 * no store to run. On many instances each keeps its own count.
 */

const windows = new Map<string, number[]>();

/**
 * Counts a call against `key`, at most `perMinute` in any minute. Returns 0 when it is let
 * through, else the seconds until it would be.
 */
export function hit(key: string, perMinute: number, now = Date.now()): number {
  const recent = (windows.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) {
    windows.set(key, recent);
    return Math.max(1, Math.ceil((recent[0]! + 60_000 - now) / 1000));
  }
  recent.push(now);
  windows.set(key, recent);
  // forget callers that went quiet so the map does not grow without end
  if (windows.size > 10_000) for (const [k, v] of windows) if (!v.some((t) => now - t < 60_000)) windows.delete(k);
  return 0;
}

/**
 * Keeps calls to one upstream to `perMinute`: a burst that size goes straight through, then calls
 * wait their turn, and a call that would wait longer than `maxWaitMs` gives up instead.
 */
export function pacer(perMinute: number, maxWaitMs = 8_000) {
  const rate = perMinute / 60_000;
  let tokens = perMinute;
  let at = Date.now();
  return async function wait(): Promise<void> {
    const now = Date.now();
    tokens = Math.min(perMinute, tokens + (now - at) * rate);
    at = now;
    tokens -= 1;
    if (tokens >= 0) return;
    const ms = -tokens / rate;
    if (ms > maxWaitMs) {
      tokens += 1;
      throw new Error('upstream busy');
    }
    await new Promise((r) => setTimeout(r, ms));
  };
}
