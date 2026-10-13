'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowUpRight, Clapperboard, Copy, CopyCheck, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { KEYS, type Recent } from '../lib/game';
import { pushRecent } from '../lib/recent';
import type { ApiError, BoardRow, TokenInfo, TokenReceipts, TraderReceipts } from '../lib/types';
import { date, mcap, pct, price, short, span, usd } from '../lib/format';
import { stepOf } from '../lib/candles';
import { marketOf } from '../lib/market';
import { traderStory } from '../lib/traderVideo';
import { marketStory } from '../lib/marketVideo';
import type { ReplayVideo } from '../lib/replayVideo';
import { supplyOf } from '../lib/receipts';
import { ROUTES } from '../lib/site';
import { copyText } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Failure, Loading } from './States';
import { TokenImage } from './TokenImage';
import { ReplayChart } from './ReplayChart';
import { VideoExport, VideoSheet } from './VideoExport';

/** Wallets shown on each side of the board. */
const SIDE = 3;

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

/** The token's market right now and its every candle (as a video too), then its top 3 winners and losers to copy or turn into a video. */
function TokenPage({ r }: { r: TokenReceipts }) {
  const { token } = r;
  const [now] = useState(() => Date.now() / 1000);
  // DEX traders read market cap more than price: the supply turns one into the other
  const supply = supplyOf(token);
  const cap = (p: number) => (supply ? mcap(p * supply) : price(p));
  // every candle the feed has since launch, none merged
  const chart = useMemo(() => ({ candles: r.candles, step: stepOf(r.candles) }), [r.candles]);
  // the same history as a video, launch to now
  const film = useMemo(() => marketStory(r, now), [r, now]);
  const market = marketOf({ priceUsd: token.priceUsd, athUsd: r.ath.priceUsd, change24h: token.change24h, buys: r.window.buys, sells: r.window.sells });
  const winners = r.board.filter((w) => w.pnl > 0).slice(0, SIDE);
  const losers = r.board.filter((w) => w.pnl < 0).reverse().slice(0, SIDE);

  return (
    <div className="reveal mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
      {/* the ticker */}
      <header className="flex items-center gap-3">
        <TokenImage src={token.image} symbol={token.symbol} className="size-10 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-baseline gap-2 truncate">
            <span className="display text-[24px]">{token.symbol}</span>
            <span className="truncate text-[13px] text-muted">{token.name}</span>
          </h1>
          <p className="truncate text-[12.5px] text-muted">
            {token.chainName} · {token.dex} · {token.quoteSymbol} pair
          </p>
        </div>
        <div className="text-right">
          <p className="num display text-[24px]">{supply ? `MC ${mcap(token.mcapUsd)}` : price(token.priceUsd)}</p>
          {token.change24h !== null && <p className={cx('num text-[12.5px] font-medium', token.change24h >= 0 ? 'text-pos' : 'text-neg')}>{pct(token.change24h / 100, { signed: true })} 24h</p>}
        </div>
      </header>

      {/* the market right now: one word on where it stands, then the numbers behind it */}
      <section className="panel mt-4 overflow-hidden" aria-label="Market">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <span className={cx('grid size-9 shrink-0 place-items-center rounded-lg', market.tone === 'pos' ? 'bg-pos-wash text-pos' : market.tone === 'neg' ? 'bg-neg-wash text-neg' : 'bg-subtle text-ink-2')} aria-hidden>
            {market.tone === 'pos' ? <TrendingUp className="size-4.5" /> : market.tone === 'neg' ? <TrendingDown className="size-4.5" /> : <Activity className="size-4.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cx('text-[15px] font-semibold leading-tight', market.tone === 'pos' && 'text-pos', market.tone === 'neg' && 'text-neg')}>{market.label}</p>
            <p className="truncate text-[12.5px] text-muted">{market.line}</p>
          </div>
        </div>
        {/* the numbers, in a grid that wraps instead of scrolling sideways on a phone */}
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line text-[12.5px] sm:grid-cols-4">
          <Kv k="Price" v={price(token.priceUsd)} />
          <Kv k={supply ? 'ATH MC' : 'ATH'} v={cap(r.ath.priceUsd)} />
          <Kv k="From ATH" v={market.fromAth === null ? '-' : pct(market.fromAth, { signed: true })} tone={market.fromAth !== null && market.fromAth < -0.005 ? 'neg' : null} />
          <Kv k="24h" v={token.change24h === null ? '-' : pct(token.change24h / 100, { signed: true })} tone={token.change24h === null ? null : token.change24h >= 0 ? 'pos' : 'neg'} />
          <Kv k="Liquidity" v={usd(token.liquidityUsd)} />
          <Kv k="Vol 24h" v={usd(token.volume24hUsd)} />
          <Kv k={`Traders · ${span(r.window.to - r.window.from)}`} v={String(r.window.traders)} />
          <Kv k="Launched" v={token.createdAt ? `${span(now - token.createdAt)} ago` : '-'} />
        </dl>
        {market.buyShare !== null && (
          <div className="border-t border-line px-3.5 py-2.5">
            <div className="num flex justify-between text-[11.5px]">
              <span className="text-pos">{r.window.buys} buys</span>
              <span className="text-muted">latest {r.window.trades} trades</span>
              <span className="text-neg">{r.window.sells} sells</span>
            </div>
            <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-neg" aria-label={`${pct(market.buyShare)} of the latest trades are buys`}>
              <div className="h-full bg-pos" style={{ width: `${market.buyShare * 100}%` }} />
            </div>
          </div>
        )}
      </section>

      {/* the token's whole history, every candle */}
      <section className="panel mt-4 p-3 sm:p-4" aria-labelledby="chart-title">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 id="chart-title" className="eyebrow">
            Since launch
          </h2>
          <p className="num text-[11.5px] text-muted">
            {chart.candles.length} × {r.candle}
          </p>
        </div>
        <ReplayChart className="md:aspect-[3/1] lg:aspect-[4/1]" candles={chart.candles} step={chart.step} scale={supply || 1} label={supply ? mcap : price} tone={token.change24h === null ? null : token.change24h >= 0 ? 'pos' : 'neg'} />
        <div className="num mt-1 flex justify-between pr-14 text-[11px] text-muted sm:pr-16">
          <span>Launched {date(token.createdAt ?? chart.candles[0]?.[0] ?? now)}</span>
          <span>Now</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          {film ? <VideoExport video={film.video} fileBase={film.fileBase} title={`Video · ${token.symbol} since launch`} className="btn-primary h-9 min-h-0 px-3 text-[12.5px]" /> : <span />}
          <a href={token.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
            DexScreener <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="board-title">
        <h2 id="board-title" className="text-[15px] font-semibold tracking-tight">
          Top traders
        </h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {`${r.board.length} wallets · last ${span(r.window.to - r.window.from)}`}
        </p>
        {r.board.length === 0 ? (
          <p className="panel mt-2 px-4 py-6 text-[13px] text-muted">No recent trades in the feed.</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 sm:gap-3">
            <Side title="Top gainers" tone="pos" rows={winners} empty="Nobody in profit yet." token={token} />
            <Side title="Biggest losers" tone="neg" rows={losers} empty="Nobody down yet." token={token} />
          </div>
        )}
      </section>
    </div>
  );
}

function Kv({ k, v, tone = null }: { k: string; v: string; tone?: 'pos' | 'neg' | null }) {
  return (
    <div className="min-w-0 bg-surface px-3 py-2">
      <dt className="truncate text-[11.5px] text-muted">{k}</dt>
      <dd className={cx('num mt-0.5 truncate text-[14px] font-semibold', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{v}</dd>
    </div>
  );
}

const copy = async (text: string, what: string) => toast((await copyText(text)) ? `${what} copied.` : `Couldn’t copy the ${what.toLowerCase()}.`);

/** One side of the board: its top 3, each with copy, replay and a video made right here. */
function Side({ title, tone, rows, empty, token }: { title: string; tone: 'pos' | 'neg'; rows: BoardRow[]; empty: string; token: TokenInfo }) {
  return (
    <div className="panel min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1.5">
        <h3 className={cx('flex flex-1 items-center gap-1.5 text-[12px] font-semibold tracking-wide uppercase', tone === 'pos' ? 'text-pos' : 'text-neg')}>
          {tone === 'pos' ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
          {title}
        </h3>
        {rows.length > 0 && (
          <button type="button" onClick={() => copy(rows.map((r) => r.trader).join('\n'), rows.length === 1 ? 'Address' : `${rows.length} addresses`)} className="btn btn-quiet -my-1 h-7 min-h-0 px-2 text-[12px]">
            <CopyCheck className="size-3.5" aria-hidden /> Copy {rows.length === 1 ? '1' : `top ${rows.length}`}
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 pb-3 text-[12.5px] text-muted">{empty}</p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((row, i) => (
            <li key={row.trader} className="flex items-center gap-2 px-3 py-2">
              <span className="num w-4 shrink-0 text-[11.5px] text-faint">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <Link href={ROUTES.trader(row.trader, token.address)} className="num min-w-0 truncate text-[13px] font-medium hover:underline" title="Replay this wallet">
                    {short(row.trader)}
                  </Link>
                  <button type="button" onClick={() => copy(row.trader, 'Address')} aria-label={`Copy ${row.trader}`} title="Copy address" className="-my-1 grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink">
                    <Copy className="size-3.5" aria-hidden />
                  </button>
                </div>
                <div className="num flex flex-wrap items-baseline gap-x-1.5">
                  <span className={cx('text-[14px] font-semibold', tone === 'pos' ? 'text-pos' : 'text-neg')}>{usd(row.pnl, { signed: true })}</span>
                  {row.roi !== null && <span className={cx('text-[11.5px]', tone === 'pos' ? 'text-pos' : 'text-neg')}>{pct(row.roi, { signed: true })}</span>}
                </div>
                <p className="num truncate text-[11.5px] text-muted">
                  {row.trades} {row.trades === 1 ? 'trade' : 'trades'} · {usd(row.usdIn)} in
                </p>
              </div>
              <QuickVideo trader={row.trader} token={token} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Makes a wallet's video without leaving the token: reads its trades, then opens the video maker. */
function QuickVideo({ trader, token }: { trader: string; token: TokenInfo }) {
  const [busy, setBusy] = useState(false);
  const [story, setStory] = useState<{ video: ReplayVideo; fileBase: string } | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const make = async () => {
    if (story) return setOpen(true);
    setBusy(true);
    try {
      const res = await fetch(`/api/trader/${encodeURIComponent(trader)}/?ca=${encodeURIComponent(token.address)}`, { headers: { accept: 'application/json' } });
      const body = (await res.json().catch(() => null)) as TraderReceipts | ApiError | null;
      if (!res.ok || !body || !('kind' in body)) throw new Error(body && 'error' in body ? body.error : 'Couldn’t read this wallet’s trades. Try again.');
      const { video, fileBase } = traderStory(body);
      setStory({ video, fileBase });
      setOpen(true);
    } catch (e) {
      toast((e as Error).message === 'Failed to fetch' ? 'You look offline. Check the connection and try again.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={make} disabled={busy} className="btn btn-primary h-9 min-h-0 shrink-0 px-3 text-[12.5px]" aria-label={`Make a video of ${short(trader)}`}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Clapperboard className="size-3.5" aria-hidden />}
        Video
      </button>
      <VideoSheet video={story?.video ?? null} fileBase={story?.fileBase ?? ''} open={open} onClose={close} title={`Video · ${short(trader)} on ${token.symbol}`} />
    </>
  );
}
