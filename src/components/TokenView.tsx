'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Copy, TrendingDown, TrendingUp } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { KEYS, type Recent } from '../lib/game';
import { pushRecent } from '../lib/recent';
import type { BoardRow, TokenReceipts } from '../lib/types';
import { date, mcap, pct, price, short, span, usd } from '../lib/format';
import { bucket } from '../lib/candles';
import { supplyOf } from '../lib/receipts';
import { ROUTES } from '../lib/site';
import { copyText } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Failure, Loading } from './States';
import { TokenImage } from './TokenImage';
import { ReplayChart } from './ReplayChart';

/** Wallets shown on each side of the board. */
const SIDE = 3;
/** Most candles drawn at once. */
const CANDLES = 80;

export function TokenView({ ca }: { ca: string }) {
  const { state, reload } = useApi<TokenReceipts>(`/api/token/${ca}/`);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (data) setRecent((r) => pushRecent(r, { kind: 'token', address: data.token.address, label: `$${data.token.symbol}` }));
  }, [data, setRecent]);

  if (state.status === 'loading') return <Loading what={`Loading ${short(ca)}’s latest trades…`} />;
  if (state.status === 'error') return <Failure error={state.error} onRetry={reload} />;
  return <TokenPage r={state.data} />;
}

/** The token at a glance and its all-time chart, then its top 3 winners and losers to copy or replay. */
function TokenPage({ r }: { r: TokenReceipts }) {
  const { token } = r;
  const [now] = useState(() => Date.now() / 1000);
  // DEX traders read market cap more than price: the supply turns one into the other
  const supply = supplyOf(token);
  const cap = (p: number) => (supply ? mcap(p * supply) : price(p));
  const chart = useMemo(() => bucket(r.candles, CANDLES), [r.candles]);
  const winners = r.board.filter((w) => w.pnl > 0).slice(0, SIDE);
  const losers = r.board.filter((w) => w.pnl < 0).reverse().slice(0, SIDE);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
      {/* the ticker */}
      <header className="flex items-center gap-3">
        <TokenImage src={token.image} symbol={token.symbol} className="size-10 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-baseline gap-2 truncate">
            <span className="text-[18px] font-semibold tracking-tight">{token.symbol}</span>
            <span className="truncate text-[13px] text-muted">{token.name}</span>
          </h1>
          <p className="truncate text-[12.5px] text-muted">
            {token.chainName} · {token.dex} · {token.quoteSymbol} pair
          </p>
        </div>
        <div className="text-right">
          <p className="num text-[18px] font-semibold tracking-tight">{supply ? `MC ${mcap(token.mcapUsd)}` : price(token.priceUsd)}</p>
          {token.change24h !== null && <p className={cx('num text-[12.5px] font-medium', token.change24h >= 0 ? 'text-pos' : 'text-neg')}>{pct(token.change24h / 100, { signed: true })} 24h</p>}
        </div>
      </header>
      <dl className="no-scrollbar mt-4 flex gap-5 overflow-x-auto border-y border-line py-2.5 text-[12.5px]">
        <Kv k="Price" v={price(token.priceUsd)} />
        <Kv k="Liquidity" v={usd(token.liquidityUsd)} />
        <Kv k="Vol 24h" v={usd(token.volume24hUsd)} />
        <Kv k="ATH" v={cap(r.ath.priceUsd)} />
        <a href={token.url} target="_blank" rel="noreferrer" className="ml-auto flex shrink-0 items-center gap-1 text-muted hover:text-ink">
          DexScreener <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </dl>
      {token.createdAt && (
        <p className="num mt-2.5 text-[12.5px] text-muted">
          Launched <span className="font-medium text-ink">{date(token.createdAt)}</span> · {span(now - token.createdAt)} ago to now
        </p>
      )}

      {/* the token's whole history */}
      <section className="panel mt-4 p-3 sm:p-4" aria-label="All-time chart">
        <ReplayChart className="md:aspect-[3/1] lg:aspect-[4/1]" candles={chart.candles} step={chart.step} scale={supply || 1} label={supply ? mcap : price} tone={token.change24h === null ? null : token.change24h >= 0 ? 'pos' : 'neg'} />
        <div className="num mt-1 flex justify-between pr-14 text-[11px] text-muted sm:pr-16">
          <span>Launched {date(token.createdAt ?? chart.candles[0]?.[0] ?? now)}</span>
          <span>Now</span>
        </div>
      </section>


      <section className="mt-6" aria-labelledby="board-title">
        <h2 id="board-title" className="text-[14px] font-semibold">
          Recent traders
        </h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {`${r.board.length} wallets in the latest ${r.window.trades} trades (${span(r.window.to - r.window.from)}). Copy an address, or tap a wallet to replay its trades and make a video.`}
        </p>
        {r.board.length === 0 ? (
          <p className="panel mt-2 px-4 py-6 text-[13px] text-muted">No recent trades in the feed.</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
            <Side title="Top gainers" tone="pos" rows={winners} empty="Nobody in profit yet." token={token.address} />
            <Side title="Biggest losers" tone="neg" rows={losers} empty="Nobody down yet." token={token.address} />
          </div>
        )}
      </section>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="num font-medium">{v}</dd>
    </div>
  );
}

/** One side of the board: a column of wallet cards, green for winners, red for losers. */
function Side({ title, tone, rows, empty, token }: { title: string; tone: 'pos' | 'neg'; rows: BoardRow[]; empty: string; token: string }) {
  return (
    <div className="panel min-w-0 overflow-hidden">
      <div className={cx('h-1', tone === 'pos' ? 'bg-pos' : 'bg-neg')} aria-hidden />
      <h3 className={cx('flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 text-[12px] font-semibold tracking-wide uppercase', tone === 'pos' ? 'text-pos' : 'text-neg')}>
        {tone === 'pos' ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="px-3 pb-3 text-[12.5px] text-muted">{empty}</p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((row, i) => (
            <li key={row.trader} className="relative px-3 py-2 transition-colors hover:bg-hover">
              <div className="flex items-center gap-1">
                <span className="num w-4 shrink-0 text-[11.5px] text-faint">{i + 1}</span>
                <Link href={ROUTES.trader(row.trader, token)} className="num min-w-0 truncate text-[13px] font-medium after:absolute after:inset-0">
                  {short(row.trader)}
                </Link>
                <button
                  type="button"
                  onClick={async () => toast((await copyText(row.trader)) ? 'Address copied.' : 'Couldn’t copy the address.')}
                  aria-label={`Copy ${row.trader}`}
                  title="Copy address"
                  className="relative -my-1 ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink"
                >
                  <Copy className="size-3.5" aria-hidden />
                </button>
              </div>
              <div className="num mt-0.5 flex flex-wrap items-baseline gap-x-1.5 pl-5">
                <span className={cx('text-[14px] font-semibold', tone === 'pos' ? 'text-pos' : 'text-neg')}>{usd(row.pnl, { signed: true })}</span>
                {row.roi !== null && <span className={cx('text-[11.5px]', tone === 'pos' ? 'text-pos' : 'text-neg')}>{pct(row.roi, { signed: true })}</span>}
              </div>
              <p className="num truncate pl-5 text-[11.5px] text-muted">
                {row.trades} {row.trades === 1 ? 'trade' : 'trades'} · {usd(row.usdIn)} in
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
