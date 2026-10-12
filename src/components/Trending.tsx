'use client';

import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { pct, price, usd } from '../lib/format';
import { toneOf } from '../lib/game';
import { ROUTES } from '../lib/site';
import type { TokenInfo } from '../lib/types';
import { TokenRow } from './TokenRow';

/** Rows before "show all", so My paper trades sits close under it on phones. */
const SHOWN = 5;

/** What DexScreener is boosting now, one tap from a paper trade. */
export function Trending() {
  const { state } = useApi<{ tokens: TokenInfo[] }>('/api/trending/');
  const [more, setMore] = useState(false);
  const tokens = state.status === 'ready' ? state.data.tokens : [];
  return (
    <section aria-labelledby="trending" className="panel overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line px-3 py-2.5 sm:px-4">
        <h2 id="trending" className="text-[13.5px] font-semibold">
          Trending on DexScreener
        </h2>
        <span className="eyebrow">24h</span>
      </div>
      {state.status === 'loading' && (
        <ul className="divide-y divide-line">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="skeleton size-8 rounded-full" />
              <div className="skeleton h-3.5 flex-1" />
            </li>
          ))}
        </ul>
      )}
      {state.status === 'error' && <p className="px-4 py-6 text-[13px] text-muted">Couldn’t load trending tokens right now.</p>}
      {state.status === 'ready' && (
        <ul className="divide-y divide-line">
          {(more ? tokens : tokens.slice(0, SHOWN)).map((t) => (
            <li key={`${t.chain}:${t.address}`}>
              <TokenRow
                href={ROUTES.token(t.address)}
                image={t.image}
                symbol={t.symbol}
                sub={`${t.chainName} · mcap ${usd(t.mcapUsd)}`}
                right={price(t.priceUsd)}
                rightSub={t.change24h === null ? undefined : pct(t.change24h / 100, { signed: true })}
                rightTone={t.change24h === null ? null : toneOf(t.change24h)}
              />
            </li>
          ))}
        </ul>
      )}
      {tokens.length > SHOWN && (
        <button type="button" onClick={() => setMore((m) => !m)} className="w-full border-t border-line py-2.5 text-[13px] text-muted hover:bg-hover hover:text-ink">
          {more ? 'Show less' : `Show all ${tokens.length}`}
        </button>
      )}
    </section>
  );
}
