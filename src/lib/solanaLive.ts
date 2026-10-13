import 'server-only';

/**
 * The RPC's websocket: SOLANA_WS_URL, or SOLANA_RPC_URL with its scheme swapped. The public
 * endpoint is left out on purpose: its websocket limits are too tight to share.
 */
export function wsUrl(env: Record<string, string | undefined> = process.env): string | null {
  if (env.SOLANA_WS_URL) return env.SOLANA_WS_URL;
  if (!env.SOLANA_RPC_URL) return null;
  try {
    const u = new URL(env.SOLANA_RPC_URL);
    u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
    return u.toString();
  } catch {
    return null;
  }
}
