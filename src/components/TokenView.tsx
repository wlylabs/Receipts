'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowUpRight, ChevronRight, Clapperboard, Copy, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
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
import { ChartStylePicker } from './ChartStylePicker';
import { Trail } from './Trail';
import { ReferralPlug } from './ReferralPlug';
import { tokenPlug } from '../lib/referral';

/** Wallets shown on each side of the board. */
const SIDE = 3;

export function TokenView({ ca }: { ca: string }) {
  const { state, reload } = useApi<TokenReceipts>(`/api/token/${ca}/`);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (data) setRecent((r) => pushRecent(r, { kind: 'token', address: data.token.address, label: `$${data.token.symbol}` }));
  }, [data, setRecent]);

  if (state.status === 'loading') return <Loading what={`Reading ${short(ca)}’s chart and latest trades…`} />;
  if (state.status === 'error') return <Failure error={state.error} onRetry={reload} />;
  return <TokenPage r={state.data} />;
}

/** The token's market right now and its every candle (as a video too), then its top 3 winners and losers to replay or turn into a video. */
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
  const plug = tokenPlug(token);
  const dayTone = token.change24h === null ? null : token.change24h >= 0 ? 'pos' : 'neg';

  return (
    <div className="reveal mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <Trail crumbs={[{ step: 'Token', label: `$${token.symbol}` }]} />

      {/* the ticker */}
      <header className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-3">
        <TokenImage src={token.image} symbol={token.symbol} className="size-12 text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="display text-[30px] sm:text-[36px]">{token.symbol}</span>
            <span className="truncate text-[14px] text-muted">{token.name}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="chip">{token.chainName}</span>
            <span className="chip">{token.dex}</span>
            <span className="chip">{token.symbol}/{token.quoteSymbol}</span>
            <button type="button" onClick={() => copy(token.address, 'CA')} className="chip transition-colors hover:border-line-strong hover:text-ink" title="Copy the contract address">
              {short(token.address)} <Copy className="size-3" aria-hidden />
            </button>
            <a href={token.url} target="_blank" rel="noreferrer" className="chip transition-colors hover:border-line-strong hover:text-ink">
              DexScreener <ArrowUpRight className="size-3" aria-hidden />
            </a>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="label">{supply ? 'Market cap' : 'Price'}</p>
          <p className="num display mt-1 text-[30px] sm:text-[36px]">{supply ? mcap(token.mcapUsd) : price(token.priceUsd)}</p>
          {token.change24h !== null && (
            <p className={cx('mono mt-1 inline-block rounded px-1.5 py-0.5 text-[12px] font-semibold', dayTone === 'pos' ? 'bg-pos-wash text-pos' : 'bg-neg-wash text-neg')}>{pct(token.change24h / 100, { signed: true })} 24h</p>
          )}
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* the token's whole history, every candle */}
        <section className="panel min-w-0 p-3 sm:p-4" aria-labelledby="chart-title">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <h2 id="chart-title" className="label">
              Since launch · {chart.candles.length} × {r.candle}
            </h2>
            <ChartStylePicker className="-my-1.5" />
          </div>
          <ReplayChart className="md:aspect-[2/1]" candles={chart.candles} step={chart.step} scale={supply || 1} label={supply ? mcap : price} tone={dayTone} />
          <div className="mono mt-1 flex justify-between pr-14 text-[10.5px] text-muted sm:pr-16">
            <span>Launched {date(token.createdAt ?? chart.candles[0]?.[0] ?? now)}</span>
            <span>Now</span>
          </div>
          {film && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line-strong px-1 pt-3">
              <p className="text-[13px] text-muted">Turn this chart into a launch-to-now video.</p>
              <VideoExport video={film.video} fileBase={film.fileBase} title={`Video · ${token.symbol} since launch`} className="btn-quiet h-9 min-h-0 px-3 text-[13px]" />
            </div>
          )}
        </section>

        {/* the market right now: one word on where it stands, then the numbers behind it */}
        <aside className="panel overflow-hidden" aria-label="Market">
          <div className={cx('flex items-center gap-3 px-4 py-3.5', market.tone === 'pos' ? 'bg-pos-wash' : market.tone === 'neg' ? 'bg-neg-wash' : 'bg-subtle')}>
            <span className={cx('grid size-9 shrink-0 place-items-center rounded-lg bg-surface ring-1 ring-line', market.tone === 'pos' ? 'text-pos' : market.tone === 'neg' ? 'text-neg' : 'text-ink-2')} aria-hidden>
              {market.tone === 'pos' ? <TrendingUp className="size-4.5" /> : market.tone === 'neg' ? <TrendingDown className="size-4.5" /> : <Activity className="size-4.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cx('text-[15px] font-semibold leading-tight', market.tone === 'pos' && 'text-pos', market.tone === 'neg' && 'text-neg')}>{market.label}</p>
              <p className="text-[12.5px] leading-snug text-ink-2">{market.line}</p>
            </div>
          </div>
          <dl className="px-4 py-2 text-[13px]">
            <Kv k="Price" v={price(token.priceUsd)} />
            <Kv k={supply ? 'ATH MC' : 'ATH'} v={cap(r.ath.priceUsd)} />
            <Kv k="From ATH" v={market.fromAth === null ? '-' : pct(market.fromAth, { signed: true })} tone={market.fromAth !== null && market.fromAth < -0.005 ? 'neg' : null} />
            <Kv k="Liquidity" v={usd(token.liquidityUsd)} />
            <Kv k="Volume 24h" v={usd(token.volume24hUsd)} />
            <Kv k={`Traders · ${span(r.window.to - r.window.from)}`} v={String(r.window.traders)} />
            <Kv k="Launched" v={token.createdAt ? `${span(now - token.createdAt)} ago` : '-'} />
          </dl>
          {market.buyShare !== null && (
            <div className="border-t border-dashed border-line-strong px-4 py-3">
              <div className="mono flex justify-between text-[11px]">
                <span className="text-pos">{r.window.buys} buys</span>
                <span className="text-muted">last {r.window.trades}</span>
                <span className="text-neg">{r.window.sells} sells</span>
              </div>
              <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-sm" aria-label={`${pct(market.buyShare)} of the latest trades are buys`}>
                <div className="h-full rounded-l-sm bg-pos" style={{ width: `${market.buyShare * 100}%` }} />
                <div className="h-full flex-1 rounded-r-sm bg-neg" />
              </div>
            </div>
          )}
          {plug && <ReferralPlug plug={plug} className="m-3" />}
        </aside>
      </div>

      <section className="mt-10" aria-labelledby="board-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="board-title" className="text-[20px] font-bold tracking-tight">
              Who won, who got wrecked
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {`${r.board.length} wallets in the last ${span(r.window.to - r.window.from)}. Pick one to replay its trades.`}
            </p>
          </div>
        </div>
        {r.board.length === 0 ? (
          <p className="panel mt-3 px-4 py-6 text-[13px] text-muted">No recent trades in the feed.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
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
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-2 last:border-0">
      <dt className="truncate text-muted">{k}</dt>
      <dd className={cx('mono truncate font-medium', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{v}</dd>
    </div>
  );
}

const copy = async (text: string, what: string) => toast((await copyText(text)) ? `${what} copied.` : `Couldn’t copy the ${what.toLowerCase()}.`);

/** One side of the board: its top 3, each to replay, copy, or turn into a video right here. */
function Side({ title, tone, rows, empty, token }: { title: string; tone: 'pos' | 'neg'; rows: BoardRow[]; empty: string; token: TokenInfo }) {
  return (
    <div className="panel min-w-0 overflow-hidden">
      <div className={cx('flex items-center gap-2 border-b border-line px-4 py-2.5', tone === 'pos' ? 'bg-pos-wash' : 'bg-neg-wash')}>
        <h3 className={cx('label flex flex-1 items-center gap-1.5 font-semibold', tone === 'pos' ? 'text-pos' : 'text-neg')}>
          {tone === 'pos' ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
          {title}
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-muted">{empty}</p>
      ) : (
        <ol>
          {rows.map((row, i) => (
            <li key={row.trader} className="group relative flex items-center gap-3 border-b border-dashed border-line px-4 py-3 transition-colors last:border-0 hover:bg-hover/60">
              <span className="mono w-5 shrink-0 text-[12px] font-bold text-faint">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  {/* the whole row opens the replay; the buttons sit above that link */}
                  <Link href={ROUTES.trader(row.trader, token.address)} className="mono min-w-0 truncate text-[13px] font-medium after:absolute after:inset-0 hover:underline" title="Replay this wallet">
                    {short(row.trader)}
                  </Link>
                  <button type="button" onClick={() => copy(row.trader, 'Address')} aria-label={`Copy ${row.trader}`} title="Copy address" className="relative -my-1 grid size-7 shrink-0 place-items-center rounded-md text-faint hover:bg-subtle hover:text-ink">
                    <Copy className="size-3.5" aria-hidden />
                  </button>
                </div>
                <p className="mono truncate text-[11.5px] text-muted">
                  {row.trades} {row.trades === 1 ? 'trade' : 'trades'} · {usd(row.usdIn)} in
                </p>
              </div>
              <div className="mono text-right">
                <p className={cx('text-[15px] font-bold', tone === 'pos' ? 'text-pos' : 'text-neg')}>{usd(row.pnl, { signed: true })}</p>
                {row.roi !== null && <p className={cx('text-[11.5px]', tone === 'pos' ? 'text-pos' : 'text-neg')}>{pct(row.roi, { signed: true })}</p>}
              </div>
              <div className="relative flex shrink-0 items-center gap-1">
                <QuickVideo trader={row.trader} token={token} />
                <ChevronRight className="hidden size-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink sm:block" aria-hidden />
              </div>
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
      <button type="button" onClick={make} disabled={busy} className="btn btn-quiet h-8 min-h-0 shrink-0 px-2.5 text-[12px]" aria-label={`Make a video of ${short(trader)}`} title="Make a video">
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Clapperboard className="size-3.5" aria-hidden />}
        <span className="hidden sm:inline">Video</span>
      </button>
      <VideoSheet video={story?.video ?? null} fileBase={story?.fileBase ?? ''} open={open} onClose={close} title={`Video · ${short(trader)} on ${token.symbol}`} />
    </>
  );
}
