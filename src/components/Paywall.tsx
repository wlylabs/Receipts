'use client';

import { useEffect, useRef, useState } from 'react';
import type { Wallet } from '@wallet-standard/base';
import { Check, Loader2, Smartphone } from 'lucide-react';
import { accountOf, signAndSend, solanaWallets } from '../lib/wallets';
import { cx } from '../lib/cx';
import type { ApiError, PayQuote } from '../lib/types';

type Coin = PayQuote['coin'];

const post = async <T,>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json()) as T | ApiError;
  if (!res.ok) throw new Error((json as ApiError).error ?? 'Something went wrong.');
  return json as T;
};

const mobile = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/**
 * One download's price, paid from a Solana wallet in this browser, or by scanning the Solana Pay
 * code with a phone. It watches the chain for the payment and calls `onPaid` once it lands.
 */
export function Paywall({ priceUsd, onPaid, onCancel }: { priceUsd: number; onPaid: () => void; onCancel: () => void }) {
  const [coin, setCoin] = useState<Coin>('USDC');
  const [q, setQuote] = useState<PayQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null);
  const paid = useRef(onPaid);
  useEffect(() => {
    paid.current = onPaid;
  });

  useEffect(() => solanaWallets(setWallets), []);

  // a fresh quote for the coin, and again when one runs out
  useEffect(() => {
    let live = true;
    let timer = 0;
    const get = () => {
      setQuote(null);
      setError(null);
      post<PayQuote>('/api/pay/', { coin })
        .then((r) => {
          if (!live) return;
          setQuote(r);
          timer = window.setTimeout(get, Math.max(10_000, r.exp * 1000 - Date.now() - 30_000));
        })
        .catch((e: Error) => live && setError(e.message));
    };
    get();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [coin]);

  // the code to scan, drawn from the Solana Pay link
  useEffect(() => {
    if (!q) return;
    let live = true;
    void import('qrcode').then(({ toDataURL }) => toDataURL(q.url, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then((data) => live && setQr({ url: q.url, data })));
    return () => {
      live = false;
    };
  }, [q]);

  // watch the chain for the payment, whichever way it is made
  useEffect(() => {
    if (!q) return;
    let live = true;
    let timer = 0;
    const check = async () => {
      try {
        const res = await fetch(`/api/pay/status/?token=${encodeURIComponent(q.token)}`, { cache: 'no-store' });
        if (res.ok && ((await res.json()) as { paid: boolean }).paid) {
          if (live) paid.current();
          return;
        }
      } catch {
        // keep watching
      }
      if (live) timer = window.setTimeout(check, 2500);
    };
    timer = window.setTimeout(check, 2500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  // a payment that never lands (dropped, or the wallet gave up) shouldn't leave them waiting
  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(() => {
      setSent(false);
      setError('Not seen on chain yet. If your wallet says it was sent, give it a moment; if not, pay again.');
    }, 90_000);
    return () => clearTimeout(t);
  }, [sent]);

  const pay = async (w: Wallet) => {
    if (!q || sending) return;
    setSending(w.name);
    setError(null);
    try {
      const account = await accountOf(w);
      const { transaction } = await post<{ transaction: string }>('/api/pay/tx/', { token: q.token, account: account.address });
      await signAndSend(w, account, transaction);
      setSent(true);
    } catch (e) {
      const msg = (e as Error).message ?? '';
      setError(/reject|cancel|denied|declined/i.test(msg) ? 'Payment cancelled.' : msg && !/^[A-Z]\w+Error/.test(msg) ? msg : 'The wallet could not send it. Check your balance and try again.');
    } finally {
      setSending(null);
    }
  };

  const here = typeof location === 'undefined' ? '' : location.href;
  const amount = q ? `${q.amount} ${q.coin}` : null;
  return (
    <div className="fade-in mt-4 rounded-xl border border-line p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-semibold">
          Download for <span className="num">${priceUsd.toFixed(priceUsd % 1 ? 2 : 0)}</span>
        </p>
        <button type="button" onClick={onCancel} className="text-[12.5px] text-muted hover:text-ink">
          Cancel
        </button>
      </div>

      <div role="radiogroup" aria-label="Pay in" className="mt-3 flex rounded-lg bg-subtle p-0.5">
        {(['USDC', 'SOL'] as Coin[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={coin === c}
            disabled={!!sending || sent}
            onClick={() => setCoin(c)}
            className={cx('h-8 flex-1 rounded-md text-[12.5px] font-medium', coin === c ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
          >
            {c}
          </button>
        ))}
      </div>

      {sent ? (
        <p className="mt-4 flex items-center justify-center gap-2 py-3 text-[13.5px] text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Sent. Waiting for Solana to confirm it…
        </p>
      ) : (
        <>
          {wallets.length > 0 && (
            <div className="mt-3 space-y-2">
              {wallets.map((w) => (
                <button key={w.name} type="button" onClick={() => pay(w)} disabled={!q || !!sending} className="btn btn-primary h-11 w-full">
                  {sending === w.name ? <Loader2 className="size-4 animate-spin" aria-hidden /> : (
                    // eslint-disable-next-line @next/next/no-img-element -- the wallet's own data: icon
                    <img src={w.icon} alt="" className="size-5 rounded" />
                  )}
                  Pay {amount ?? '…'} with {w.name}
                </button>
              ))}
            </div>
          )}

          {!wallets.length && mobile() && (
            <div className="mt-3 space-y-2">
              <p className="text-[12.5px] text-muted">Open this page in your wallet’s browser to pay:</p>
              <div className="flex gap-2">
                <a className="btn btn-primary h-10 flex-1" href={`https://phantom.app/ul/browse/${encodeURIComponent(here)}?ref=${encodeURIComponent(location.origin)}`}>
                  <Smartphone className="size-4" aria-hidden /> Phantom
                </a>
                <a className="btn btn-quiet h-10 flex-1" href={`https://solflare.com/ul/v1/browse/${encodeURIComponent(here)}?ref=${encodeURIComponent(location.origin)}`}>
                  <Smartphone className="size-4" aria-hidden /> Solflare
                </a>
              </div>
            </div>
          )}

          {!mobile() && (
            <div className="mt-3 flex items-center gap-3.5">
              <div className="grid size-[124px] shrink-0 place-items-center rounded-lg border border-line bg-white p-1">
                {qr && qr.url === q?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn here
                  <img src={qr.data} alt="Solana Pay code" className="size-full" />
                ) : (
                  <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
                )}
              </div>
              <div className="min-w-0 text-[12.5px] leading-relaxed text-muted">
                <p className="font-medium text-ink-2">{wallets.length ? 'Or scan with your phone' : 'Scan with your phone’s wallet'}</p>
                <p>
                  Phantom, Solflare or any Solana Pay wallet. Pay <span className="num font-medium text-ink">{amount ?? '…'}</span>; the download starts once it lands.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-3 text-[12.5px] text-neg" role="alert">
          {error}
        </p>
      )}
      {!error && !sent && q && (
        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-faint">
          <Check className="size-3" aria-hidden /> Checked on chain. One payment, one download.
        </p>
      )}
    </div>
  );
}
