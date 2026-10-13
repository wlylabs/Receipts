'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Copy, FastForward, Link2, Loader2, RotateCcw } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { useReplay } from '../hooks/useReplay';
import { useLiveWallet } from '../hooks/useLiveWallet';
import { KEYS, toneOf, type Recent } from '../lib/game';
import { position, priceAt } from '../lib/receipts';
import { traderStory } from '../lib/traderVideo';
import { pushRecent } from '../lib/recent';
import { CHAINS } from '../lib/chains';
import type { CandlesBody, TraderReceipts } from '../lib/types';
import { fitTimeframe, TIMEFRAMES, timeframeOf, windowFor } from '../lib/timeframes';
import { date, day, mcap, pct, price, short, span, usd } from '../lib/format';
import { ROUTES, SITE_URL } from '../lib/site';
import { copyText, shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Failure, Loading } from './States';
import { Holdings } from './Holdings';
import { ReplayChart } from './ReplayChart';
import { ResultCard } from './ResultCard';
import { VideoExport } from './VideoExport';
import { TokenImage } from './TokenImage';
import { TradeList } from './TradeList';
import { ChartStylePicker } from './ChartStylePicker';
import { Trail } from './Trail';
import { ReferralPlug } from './ReferralPlug';
import { traderPlug } from '../lib/referral';

const PLAY_MS = 4_200;
/** Most candles a picked size draws before merging: past this they blur on a phone. */
const FRAME_CANDLES = 240;
/** How often a held bag is re-read when no live stream is up. */
const POLL_MS = 3 * 60_000;
/** How often the candles of a minute-sized chart are fetched again. */
const CANDLES_MS = 60_000;
/** Least time between two reads of the wallet's trades, however often it transacts. */
const REFRESH_GAP_MS = 10_000;

/** A candle's length the way chart apps write it: 1m, 15m, 4h, 1D. */
function stepLabel(sec: number): string {
  if (sec % 86_400 === 0) return `${sec / 86_400}D`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  return `${Math.round(sec / 60)}m`;
}

export function TraderView({ address, ca }: { address: string; ca: string }) {
  const { state, reload } = useApi<TraderReceipts>(ca ? `/api/trader/${address}/?ca=${encodeURIComponent(ca)}` : null);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);
  const loaded = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (loaded) setRecent((r) => pushRecent(r, { kind: 'trader', address, ca: loaded.token.address, label: `${short(address)} · ${loaded.token.symbol}` }));
  }, [loaded, address, setRecent]);

  // the wallet's trades read again in the background: on a new transaction, or now and then
  const [fresh, setFresh] = useState<{ from: TraderReceipts; r: TraderReceipts } | null>(null);
  const data = fresh && fresh.from === loaded ? fresh.r : loaded;
  const busy = useRef(false);
  const lastRead = useRef(0);
  /** How many trades the page shows, to tell a new trade from a transaction that wasn't one. */
  const shownTrades = useRef<number | null>(null);
  const again = useRef(false);
  const refresh = useCallback(
    async (tag: string) => {
      if (!loaded) return;
      // one read at a time; a signal that lands during it asks for one more after
      if (busy.current) {
        again.current = true;
        return;
      }
      busy.current = true;
      for (let round = 0; round === 0 || again.current; round++) {
        again.current = false;
        // a busy wallet signals many times a second: read at most every few seconds
        const wait = lastRead.current + REFRESH_GAP_MS - Date.now();
        if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
        lastRead.current = Date.now();
        try {
          // a URL of its own, past the minute the answer is cached for
          const res = await fetch(`/api/trader/${address}/?ca=${encodeURIComponent(ca)}&v=${encodeURIComponent(`${tag}-${round}`)}`, { headers: { accept: 'application/json' } });
          if (!res.ok) continue;
          const r = (await res.json()) as TraderReceipts;
          if (r.trades.length > (shownTrades.current ?? loaded.trades.length)) toast(`New trade from ${short(address)}.`);
          shownTrades.current = r.trades.length;
          setFresh({ from: loaded, r });
        } catch {
          // offline: the next signal or poll tries again
        }
      }
      busy.current = false;
    },
    [address, ca, loaded],
  );
  const solana = !!loaded && !address.startsWith('0x');
  const live = useLiveWallet(address, solana, refresh);
  // without a live stream, a held bag is re-read every few minutes so its P&L keeps up
  const holding = !!data && data.position.open > 0;
  useEffect(() => {
    if (live || !loaded || !holding) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(`poll-${Date.now()}`);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [live, loaded, holding, refresh]);

  if (!ca) return <Holdings address={address} />;
  if (state.status === 'loading') return <Loading what={`Reading ${short(address)}’s trades on the chain…`} />;
  if (state.status === 'error' || !data) return <Failure error={state.status === 'error' ? state.error : { code: 'upstream', error: 'Try again.' }} onRetry={reload} />;
  return <TraderFrames key={`${address}:${ca}`} r={data} live={live} />;
}

/** The candle size the replay is drawn in: one GeckoTerminal size, or the token's whole life. */
type Frame = 'all' | string;

/** The wallet's trades as their own candles over the chart, rebuilt from the candles picked. */
function withCandles(r: TraderReceipts, body: CandlesBody): TraderReceipts {
  return { ...r, candles: body.candles, series: body.candles.map((c): [number, number] => [c[0], c[4]]), candle: body.tf };
}

/**
 * The replay in a candle size the viewer picks, like a chart app: it opens on the finest size that
 * fits the wallet's run, and every marker stands for the trades in one of the candles drawn, so a
 * finer size shows trades apart that a coarser one folds together.
 */
function TraderFrames({ r, live }: { r: TraderReceipts; live: boolean }) {
  const ts = useMemo(() => r.trades.map((t) => t[0]), [r.trades]);
  const holding = r.position.open > 0;
  const [now, setNow] = useState(() => Date.now() / 1000);
  const first = ts.length ? Math.min(...ts) : now;
  const last = ts.length ? Math.max(...ts) : now;
  const [frame, setFrame] = useState<Frame>(() => fitTimeframe(first, last, holding, now).label);
  const [played, setPlayed] = useState(false);
  const markPlayed = useCallback(() => setPlayed(true), []);
  const t = timeframeOf(frame);
  // a chart in minutes keeps its newest candles coming, once a minute while the tab is in view
  const ticking = !!t && t.sec < 3600;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now() / 1000);
    }, CANDLES_MS);
    return () => clearInterval(id);
  }, [ticking]);
  const win = t ? windowFor(t, first, last, holding, now) : null;
  const url =
    t && win
      ? `/api/candles/${encodeURIComponent(r.token.pair)}/?chain=${r.token.chain}&token=${encodeURIComponent(r.token.address)}&tf=${t.label}&from=${Math.floor(win.from / 60) * 60}&to=${Math.ceil(win.to / 60) * 60}`
      : null;
  const { state } = useApi<CandlesBody>(url);
  const body = state.status === 'ready' ? state.data : null;
  const ready = useMemo(() => (frame === 'all' ? r : body && body.candles.length >= 2 ? withCandles(r, body) : null), [frame, r, body]);
  const failed = frame !== 'all' && (state.status === 'error' || (state.status === 'ready' && state.data.candles.length < 2));

  // the last frame drawn stays up, dimmed, while the next one loads
  const [shown, setShown] = useState<{ frame: Frame; r: TraderReceipts; cut: boolean } | null>(null);
  if (ready && shown?.r !== ready) setShown({ frame, r: ready, cut: !!win?.cut });
  // a size GeckoTerminal can't draw falls back to the whole life
  if (failed && frame !== 'all' && !shown) setFrame('all');

  if (!shown) return <Loading what={`Drawing ${frame} candles around ${short(r.owner)}’s trades…`} />;
  const picker = (
    <div role="radiogroup" aria-label="Candle size" className="no-scrollbar -mx-1 flex gap-0.5 overflow-x-auto px-1">
      {(['all', ...TIMEFRAMES.map((x) => x.label)] as Frame[]).map((f) => (
        <button
          key={f}
          type="button"
          role="radio"
          aria-checked={frame === f}
          onClick={() => setFrame(f)}
          className={cx('mono h-7 shrink-0 rounded-md px-2 text-[11.5px] font-semibold transition-colors', frame === f ? 'bg-ink text-on-ink' : 'text-muted hover:bg-hover hover:text-ink')}
        >
          {f === 'all' ? 'All' : f}
        </button>
      ))}
      {(live || ticking) && (
        <span className="mono ml-auto flex shrink-0 items-center gap-1.5 self-center pl-2 text-[10.5px] font-semibold text-pos" title={live ? 'New trades from this wallet show as they land' : 'The newest candles load once a minute'}>
          <span className="size-1.5 animate-pulse rounded-full bg-pos" aria-hidden /> LIVE
        </span>
      )}
      {!ready && !failed && shown.frame !== frame && <Loader2 className="ml-1 size-3.5 shrink-0 self-center animate-spin text-muted" aria-label="Loading candles" />}
      {failed && <span className="ml-1 self-center whitespace-nowrap text-[11px] text-neg">Couldn’t load {frame}</span>}
    </div>
  );
  return <TraderReplay key={shown.frame} r={shown.r} frame={shown.frame} cut={shown.cut} picker={picker} pending={!ready && !failed && shown.frame !== frame} autoplay={!played} onPlayed={markPlayed} />;
}

/** The wallet's trades replaying on the chart, then the video. */
function TraderReplay({ r, frame, cut, picker, pending, autoplay, onPlayed }: { r: TraderReceipts; frame: Frame; cut: boolean; picker: ReactNode; pending: boolean; autoplay: boolean; onPlayed: () => void }) {
  // the replay plays once as the page opens; a new candle size just redraws
  const replay = useReplay(PLAY_MS, autoplay);
  const [now] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (autoplay) onPlayed();
  }, [autoplay, onPlayed]);

  const p = r.position;
  const { token, series } = r;
  const chain = CHAINS[token.chain];
  // a picked candle size keeps its candles apart, up to what the chart can still draw readably
  const { trades, chart, markers, stats, rank, from, to, supply, scale, label, video, fileBase } = useMemo(() => traderStory(r, frame === 'all' ? {} : { maxCandles: FRAME_CANDLES }), [r, frame]);
  const done = !replay.playing;
  const head = replay.t < 1 ? from + (to - from) * replay.t : undefined;
  const running = useMemo(() => {
    if (head === undefined) return p.pnl;
    const seen = trades.filter((t) => t.ts <= head);
    return seen.length ? position(seen, priceAt(series, head, token.priceUsd)).pnl : 0;
  }, [head, trades, series, token.priceUsd, p.pnl]);
  const runTone = toneOf(running);
  const plug = useMemo(() => traderPlug(token, p), [token, p]);
  const share = async () => {
    const res = await shareLink(`${SITE_URL}${ROUTES.trader(r.owner, token.address)}`, 'Receipts', `Replayed ${short(r.owner)} on $${token.symbol}: ${usd(p.pnl, { signed: true })}. Rank: ${rank.name}.`);
    if (res === 'copied') toast('Link copied.');
    else if (res === 'failed') toast('Couldn’t share. Copy the address bar instead.');
  };
  const copyOwner = async () => toast((await copyText(r.owner)) ? 'Address copied.' : 'Couldn’t copy the address.');

  return (
    <div className="reveal mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <Trail
        crumbs={[
          { step: 'Token', label: `$${token.symbol}`, href: ROUTES.token(token.address) },
          { step: 'Wallet', label: short(r.owner), href: ROUTES.wallet(r.owner) },
          { step: 'Replay', label: token.symbol },
        ]}
      />

      <header className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <p className="label">Wallet on {token.chainName}</p>
          <h1 className="mono mt-1 truncate text-[22px] font-semibold tracking-tight sm:text-[26px]" title={r.owner}>
            {short(r.owner)}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyOwner} className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
            <Copy className="size-3.5" aria-hidden /> Copy
          </button>
          {chain && (
            <a href={chain.account(r.owner)} target="_blank" rel="noreferrer" className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
              Explorer <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          )}
          <Link href={ROUTES.wallet(r.owner)} className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
            Other tokens
          </Link>
        </div>
      </header>

      {/* chart, receipt, trades: on phones the receipt comes straight after the chart */}
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* the chart, where the wallet's trades replay */}
        <section className="panel min-w-0 p-3 sm:p-4 lg:col-start-1 lg:row-start-1" aria-label="Replay">
            <div className="flex min-h-10 items-center justify-between gap-3 px-1">
              <Link href={ROUTES.token(token.address)} className="flex min-w-0 items-center gap-2.5 rounded-md hover:opacity-80">
                <TokenImage src={token.image} symbol={token.symbol} className="size-8 text-xs" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{token.symbol}</span>
                  <span className="mono block truncate text-[11.5px] text-muted">{supply ? `MC ${mcap(token.mcapUsd)}` : price(token.priceUsd)} · {frame === 'all' ? 'all-time' : `${chart.candles.length} × ${stepLabel(chart.step)}`}</span>
                </span>
              </Link>
              <div className="flex items-center gap-1">
                <div className="text-right">
                  <p className="label text-[9.5px]">{done ? 'P&L' : 'Running P&L'}</p>
                  <p className={cx('num display text-[24px] sm:text-[28px]', runTone === 'pos' && 'text-pos', runTone === 'neg' && 'text-neg')}>{usd(running, { signed: true })}</p>
                </div>
                <ChartStylePicker />
              </div>
            </div>
            <div className="mt-2 px-1">{picker}</div>
            <div className={cx('relative mt-2 transition-opacity', pending && 'opacity-50')}>
              <ReplayChart className="md:aspect-[16/9] lg:aspect-[16/8]" candles={chart.candles} step={chart.step} scale={scale} label={label} from={from} to={to} head={head} markers={markers.length <= 120 ? markers : []} tone={runTone} bubble={head !== undefined ? usd(running, { signed: true }) : undefined} />
              {/* the time axis: launch to now, or the stretch the picked candles cover */}
              <div className="mono mt-1 flex justify-between pr-14 text-[10.5px] text-muted sm:pr-16">
                <span>{frame === 'all' ? `Launched ${date(token.createdAt ?? chart.candles[0]?.[0] ?? from)}` : day(chart.candles[0]?.[0] ?? from)}</span>
                <span>{frame === 'all' || now - to < 2 * chart.step ? 'Now' : day(to)}</span>
              </div>
              {cut && <p className="mt-1 text-[11.5px] text-muted">Earlier trades are before these candles. Pick a bigger candle to see them all.</p>}
            </div>

            {/* the transport: how far the replay is, and the buttons that drive it */}
            <div className="mt-3 flex items-center gap-3 border-t border-dashed border-line-strong px-1 pt-3" role="status">
              {done ? (
                <button type="button" onClick={replay.play} className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
                  <RotateCcw className="size-3.5" aria-hidden /> Replay
                </button>
              ) : (
                <button type="button" onClick={replay.skip} className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
                  <FastForward className="size-3.5" aria-hidden /> Skip
                </button>
              )}
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
                <div className="h-full bg-ink" style={{ width: `${replay.t * 100}%` }} />
              </div>
              <span className="mono w-10 text-right text-[11px] text-muted">{done ? 'done' : `${Math.round(replay.t * 100)}%`}</span>
              <button type="button" onClick={share} className="btn btn-ghost h-9 min-h-0 px-2.5" aria-label="Share link" title="Share link">
                <Link2 className="size-4" aria-hidden />
              </button>
            </div>
        </section>

        {/* the receipt prints beside the chart and stays in view while the page scrolls */}
        <aside className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Result">
          <ResultCard
            kicker={`${short(r.owner)} on $${token.symbol}`}
            sub={token.chainName}
            pnl={usd(done ? p.pnl : running, { signed: true })}
            roi={p.roi === null ? 'no buys seen' : pct(p.roi, { signed: true })}
            tone={done ? toneOf(p.pnl) : runTone}
            rank={rank}
            stats={stats}
            printing={!done}
          >
            <VideoExport video={video} fileBase={fileBase} className="btn-primary h-12 w-full text-[15px]" label="Make the video" />
            <p className="mt-2 text-center text-[10.5px] text-muted">MP4 · SQUARE, PORTRAIT OR WIDE</p>
          </ResultCard>
          {!done && (
            <button type="button" onClick={replay.skip} className="btn btn-ghost mt-3 h-9 w-full min-h-0 text-[13px]">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Printing the receipt… skip
            </button>
          )}
          {/* the lesson the receipt just taught, and what the next trade costs on fomo with the referral */}
          {done && plug && <ReferralPlug plug={plug} className="rise mt-3" />}
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {done && <TradeList r={r} />}
          <details className="group mt-3 px-1 text-[12px] leading-relaxed text-muted">
            <summary className="label cursor-pointer list-none select-none hover:text-ink">+ How it’s counted</summary>
            <p className="mt-1.5">{sourceNote(r)}</p>
          </details>
        </div>
      </div>
    </div>
  );
}

/** Where the numbers come from and how far to trust them, in a line. */
function sourceNote(r: TraderReceipts): string {
  const { token } = r;
  if (r.source === 'feed') return `From ${token.symbol}’s latest ${r.window.trades} DEX trades (${span(r.window.to - r.window.from)}). Earlier trades by this wallet are not in that feed.`;
  const exact = r.trades.filter((t) => t[6] !== 'transfer' && t[7] !== 'candle').length;
  const swaps = r.trades.filter((t) => t[6] !== 'transfer').length;
  const parts = [`From the chain: every ${token.symbol} move in or out of this wallet${r.complete ? '' : ' (the latest ones only)'}.`];
  parts.push(exact === swaps ? 'Each swap is valued at what was really paid or received.' : `${exact} of ${swaps} swaps are valued at what was really paid or received, the rest at the chart’s candle.`);
  if (r.position.received || r.position.sent) parts.push('Tokens received for nothing are held at what they were worth then; tokens sent away leave at cost, with no profit.');
  if (r.position.feesUsd) parts.push('Network fees are taken off the P&L.');
  return parts.join(' ');
}
