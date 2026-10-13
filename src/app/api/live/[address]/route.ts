import { isWallet } from '../../../../lib/receipts';
import { fail, tooMany } from '../../../../lib/respond';
import { wsUrl } from '../../../../lib/solanaLive';

export const dynamic = 'force-dynamic';
/** A serverless function can't stay open for good: the stream ends before this and the browser reconnects. */
export const maxDuration = 60;
const OPEN_MS = 50_000;
const BEAT_MS = 15_000;

/**
 * A Solana wallet's new transactions as they land, as server-sent events: the server listens on
 * its own RPC's websocket (the key never reaches the browser) and passes on each signature. The
 * page then reads the wallet's trades again.
 */
export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const limited = tooMany(req, 'live', 20);
  if (limited) return limited;
  const { address } = await ctx.params;
  if (!isWallet(address) || address.startsWith('0x')) return fail('invalid', 'Live updates are for Solana wallets.');
  const url = wsUrl();
  if (!url) return fail('unsupported', 'Live updates need SOLANA_RPC_URL.');

  const enc = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const send = (s: string) => {
        try {
          ctrl.enqueue(enc.encode(s));
        } catch {
          // the browser has gone
        }
      };
      const ws = new WebSocket(url);
      const beat = setInterval(() => send(': beat\n\n'), BEAT_MS);
      const end = setTimeout(() => close(), OPEN_MS);
      let done = false;
      close = () => {
        if (done) return;
        done = true;
        clearInterval(beat);
        clearTimeout(end);
        try {
          ws.close();
        } catch {}
        try {
          ctrl.close();
        } catch {}
      };
      // reconnect a second after the stream ends
      send('retry: 1000\n\n');
      ws.onopen = () => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'logsSubscribe', params: [{ mentions: [address] }, { commitment: 'confirmed' }] }));
        send('event: ready\ndata: 1\n\n');
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data)) as { method?: string; params?: { result?: { value?: { signature?: string; err?: unknown } } } };
          const v = msg.params?.result?.value;
          if (msg.method === 'logsNotification' && v?.signature && !v.err) send(`event: tx\ndata: ${v.signature}\n\n`);
        } catch {}
      };
      ws.onerror = () => close();
      ws.onclose = () => close();
      req.signal.addEventListener('abort', () => close());
    },
    cancel() {
      close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
