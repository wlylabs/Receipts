'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Listens for a Solana wallet's new transactions through /api/live, which the server feeds from
 * its own RPC's websocket. `onTx` gets each signature; `live` is true while the stream is up. The
 * browser reconnects each time the server ends the stream; a server without an RPC of its own
 * answers with an error, and the hook stays quiet.
 */
export function useLiveWallet(address: string, enabled: boolean, onTx: (signature: string) => void): boolean {
  const [live, setLive] = useState(false);
  const handler = useRef(onTx);
  useEffect(() => {
    handler.current = onTx;
  }, [onTx]);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const es = new EventSource(`/api/live/${encodeURIComponent(address)}/`);
    es.addEventListener('ready', () => setLive(true));
    es.addEventListener('tx', (e) => handler.current((e as MessageEvent<string>).data));
    // a closed stream reconnects by itself; one refused (no RPC, rate limited) stays closed
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) setLive(false);
    };
    return () => {
      es.close();
      setLive(false);
    };
  }, [address, enabled]);

  return live;
}
