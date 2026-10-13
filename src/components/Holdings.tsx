'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { KEYS, type Recent } from '../lib/game';
import { pushRecent } from '../lib/recent';
import { cleanAddress, isAddress } from '../lib/receipts';
import { compact, short, usd } from '../lib/format';
import { ROUTES } from '../lib/site';
import type { WalletHoldings } from '../lib/types';
import { Failure } from './States';
import { TokenRow } from './TokenRow';

/** A wallet with no token picked yet: what it holds, or any CA it traded. */
export function Holdings({ address }: { address: string }) {
  const router = useRouter();
  const { state, reload } = useApi<WalletHoldings>(`/api/wallet/${address}/`);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);
  const [ca, setCa] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (state.status === 'ready') setRecent((r) => pushRecent(r, { kind: 'wallet', address, label: short(address) }));
  }, [state.status, address, setRecent]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = cleanAddress(ca);
    if (!isAddress(t)) {
      setError('Paste the token’s contract address.');
      return;
    }
    router.push(ROUTES.trader(address, t));
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-10">
      <p className="eyebrow">Wallet</p>
      <h1 className="num truncate text-[22px] font-semibold tracking-tight" title={address}>
        {short(address)}
      </h1>
      <p className="mt-1 text-[14px] text-muted">Pick a token to replay.</p>

      <form onSubmit={submit} className="mt-5" noValidate>
        <label htmlFor="ca" className="eyebrow">
          A token it traded (CA)
        </label>
        <div className={`field mt-1.5 h-11 pl-3 pr-1 ${error ? 'border-neg' : ''}`}>
          <input
            id="ca"
            value={ca}
            onChange={(e) => {
              setCa(e.target.value);
              setError(null);
            }}
            placeholder="Paste a token CA"
            autoComplete="off"
            spellCheck={false}
            className="num min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
          />
          <button type="submit" className="btn btn-primary h-9 min-h-0 px-3" aria-label="Replay trades">
            <ArrowRight className="size-4" />
          </button>
        </div>
        {error && (
          <p className="mt-1.5 text-[13px] text-neg" role="alert">
            {error}
          </p>
        )}
      </form>

      <section className="panel mt-5 overflow-hidden" aria-labelledby="held">
        <div className="flex items-baseline justify-between border-b border-line px-3 py-2.5 sm:px-4">
          <h2 id="held" className="text-[13.5px] font-semibold">
            Holding now
          </h2>
          {state.status === 'ready' && <span className="num eyebrow">{usd(state.data.holdings.reduce((a, h) => a + h.valueUsd, 0))}</span>}
        </div>
        {state.status === 'loading' && (
          <ul className="divide-y divide-line">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="skeleton size-8 rounded-full" />
                <div className="skeleton h-3.5 flex-1" />
              </li>
            ))}
          </ul>
        )}
        {state.status === 'error' && <Failure error={state.error} onRetry={reload} />}
        {state.status === 'ready' &&
          (state.data.holdings.length === 0 ? (
            <p className="px-4 py-6 text-[13px] leading-relaxed text-muted">Nothing held right now. Sold out? Paste the token’s CA above.</p>
          ) : (
            <ul className="divide-y divide-line">
              {state.data.holdings.map((h) => (
                <li key={`${h.token.chain}:${h.token.address}`}>
                  <TokenRow
                    href={ROUTES.trader(address, h.token.address)}
                    image={h.token.image}
                    symbol={h.token.symbol}
                    sub={`${h.token.chainName} · ${compact(h.amount)} tokens`}
                    right={usd(h.valueUsd)}
                  />
                </li>
              ))}
            </ul>
          ))}
      </section>
    </div>
  );
}
