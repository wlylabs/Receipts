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
import { Trail } from './Trail';

/** Tokens listed before the rest fold away; a big wallet holds hundreds of dust tokens. */
const SHOWN = 20;

/** A wallet with no token picked yet: what it holds, or any CA it traded. */
export function Holdings({ address }: { address: string }) {
  const router = useRouter();
  const { state, reload } = useApi<WalletHoldings>(`/api/wallet/${address}/`);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);
  const [ca, setCa] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
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

  const total = state.status === 'ready' ? state.data.holdings.reduce((a, h) => a + h.valueUsd, 0) : null;
  return (
    <div className="reveal mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <Trail crumbs={[{ step: 'Wallet', label: short(address) }]} />

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label">Wallet</p>
          <h1 className="mono mt-1 truncate text-[22px] font-semibold tracking-tight sm:text-[26px]" title={address}>
            {short(address)}
          </h1>
        </div>
        <div className="text-left sm:text-right">
          <p className="label">Holding now</p>
          <p className="num display mt-1 text-[28px] sm:text-[32px]">{total === null ? <span className="skeleton inline-block h-7 w-28 align-middle" /> : usd(total)}</p>
        </div>
      </header>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel overflow-hidden" aria-labelledby="held">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 id="held" className="flex items-center gap-2 text-[14px] font-semibold">
              Pick a token to replay
            </h2>
            {state.status === 'ready' && <span className="label">{state.data.holdings.length} tokens</span>}
          </div>
          {state.status === 'loading' && (
            <ul>
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 border-b border-dashed border-line px-4 py-3 last:border-0">
                  <div className="skeleton size-8 rounded-full" />
                  <div className="skeleton h-3.5 flex-1" />
                  <div className="skeleton h-3.5 w-16" />
                </li>
              ))}
            </ul>
          )}
          {state.status === 'error' && <Failure error={state.error} onRetry={reload} />}
          {state.status === 'ready' &&
            (state.data.holdings.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13.5px] leading-relaxed text-muted">Nothing held right now. Sold out? Paste the token’s CA on the right.</p>
            ) : (
              <ul>
                {(all ? state.data.holdings : state.data.holdings.slice(0, SHOWN)).map((h) => (
                  <li key={`${h.token.chain}:${h.token.address}`} className="border-b border-dashed border-line last:border-0">
                    <TokenRow href={ROUTES.trader(address, h.token.address)} image={h.token.image} symbol={h.token.symbol} sub={`${h.token.chainName} · ${compact(h.amount)} tokens`} right={usd(h.valueUsd)} />
                  </li>
                ))}
                {!all && state.data.holdings.length > SHOWN && (
                  <li>
                    <button type="button" onClick={() => setAll(true)} className="label w-full px-4 py-3 text-center hover:bg-hover hover:text-ink">
                      Show all {state.data.holdings.length} tokens
                    </button>
                  </li>
                )}
              </ul>
            ))}
        </section>

        <aside className="panel p-4 lg:sticky lg:top-20">
          <form onSubmit={submit} noValidate>
            <label htmlFor="ca" className="text-[14px] font-semibold">
              Sold out already?
            </label>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">Tokens it no longer holds aren’t listed. Paste the CA of any token it traded to replay it.</p>
            <div className={`field mt-3 h-11 pl-3 pr-1 ${error ? 'border-neg' : ''}`}>
              <input
                id="ca"
                value={ca}
                onChange={(e) => {
                  setCa(e.target.value);
                  setError(null);
                }}
                placeholder="Token CA"
                autoComplete="off"
                spellCheck={false}
                className="mono min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:font-sans placeholder:text-faint"
              />
              <button type="submit" className="btn btn-primary h-9 min-h-0 px-3 text-[13px]">
                Replay <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
            {error && (
              <p className="mt-1.5 text-[13px] text-neg" role="alert">
                {error}
              </p>
            )}
          </form>
        </aside>
      </div>
    </div>
  );
}
