'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Copy, FastForward, Link2, Loader2, RotateCcw } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { useReplay } from '../hooks/useReplay';
import { KEYS, toneOf, type Recent } from '../lib/game';
import { position, priceAt } from '../lib/receipts';
import { traderStory } from '../lib/traderVideo';
import { pushRecent } from '../lib/recent';
import { CHAINS } from '../lib/chains';
import type { TraderReceipts } from '../lib/types';
import { date, mcap, pct, price, short, span, usd } from '../lib/format';
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

export function TraderView({ address, ca }: { address: string; ca: string }) {
  const { state, reload } = useApi<TraderReceipts>(ca ? `/api/trader/${address}/?ca=${encodeURIComponent(ca)}` : null);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (data) setRecent((r) => pushRecent(r, { kind: 'trader', address, ca: data.token.address, label: `${short(address)} · ${data.token.symbol}` }));
  }, [data, address, setRecent]);

  if (!ca) return <Holdings address={address} />;
  if (state.status === 'loading') return <Loading what={`Reading ${short(address)}’s trades on the chain…`} />;
  if (state.status === 'error') return <Failure error={state.error} onRetry={reload} />;
  return <TraderReplay key={`${address}:${ca}`} r={state.data} />;
}

/** The wallet's trades replaying on the chart, then the video. */
function TraderReplay({ r }: { r: TraderReceipts }) {
  // the replay starts as soon as the page opens
  const replay = useReplay(PLAY_MS, true);

  const p = r.position;
  const { token, series } = r;
  const chain = CHAINS[token.chain];
  const { trades, chart, markers, stats, rank, from, to, supply, scale, label, video, fileBase } = useMemo(() => traderStory(r), [r]);
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
                  <span className="mono block truncate text-[11.5px] text-muted">{supply ? `MC ${mcap(token.mcapUsd)}` : price(token.priceUsd)} · all-time</span>
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
            <div className="relative mt-3">
              <ReplayChart className="md:aspect-[16/9] lg:aspect-[16/8]" candles={chart.candles} step={chart.step} scale={scale} label={label} from={from} to={to} head={head} markers={markers.length <= 120 ? markers : []} tone={runTone} bubble={head !== undefined ? usd(running, { signed: true }) : undefined} />
              {/* the time axis: the chart runs from launch to now */}
              <div className="mono mt-1 flex justify-between pr-14 text-[10.5px] text-muted sm:pr-16">
                <span>Launched {date(token.createdAt ?? chart.candles[0]?.[0] ?? from)}</span>
                <span>Now</span>
              </div>
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
