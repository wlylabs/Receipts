'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, FastForward, Link2, Loader2, RotateCcw } from 'lucide-react';
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
import { shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Failure, Loading } from './States';
import { Holdings } from './Holdings';
import { ReplayChart } from './ReplayChart';
import { ResultCard } from './ResultCard';
import { VideoExport } from './VideoExport';
import { TokenImage } from './TokenImage';

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
  const share = async () => {
    const res = await shareLink(`${SITE_URL}${ROUTES.trader(r.owner, token.address)}`, 'Receipts', `Replayed ${short(r.owner)} on $${token.symbol}: ${usd(p.pnl, { signed: true })}. Rank: ${rank.name}.`);
    if (res === 'copied') toast('Link copied.');
    else if (res === 'failed') toast('Couldn’t share. Copy the address bar instead.');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <p className="eyebrow">Wallet · {token.chainName}</p>
            <h1 className="num truncate text-[20px] font-semibold tracking-tight" title={r.owner}>
              {short(r.owner)}
            </h1>
          </div>
          <Link href={ROUTES.token(token.address)} className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
            <ArrowLeft className="size-3.5" aria-hidden /> {token.symbol} traders
          </Link>
          <Link href={ROUTES.wallet(r.owner)} className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
            Other tokens
          </Link>
          {chain && (
            <a href={chain.account(r.owner)} target="_blank" rel="noreferrer" className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]" aria-label="Open the wallet in the explorer">
              <span className="hidden sm:inline">Explorer</span> <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          )}
        </header>

        {/* the chart, where the wallet's trades replay, with the video right under it */}
        <section className="panel mt-4 p-3 sm:p-4" aria-label="Replay">
          <div className="flex min-h-9 items-center justify-between gap-3 px-1">
            <Link href={ROUTES.token(token.address)} className="flex min-w-0 items-center gap-2">
              <TokenImage src={token.image} symbol={token.symbol} className="size-7 text-xs" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{token.symbol}</span>
                <span className="block truncate text-[12px] text-muted">
                  {supply ? `MC ${mcap(token.mcapUsd)}` : price(token.priceUsd)} · all-time chart
                </span>
              </span>
            </Link>
            <p className={cx('num text-[20px] font-semibold tracking-tight', runTone === 'pos' && 'text-pos', runTone === 'neg' && 'text-neg')}>{usd(running, { signed: true })}</p>
          </div>
          <div className="relative mt-3">
            <ReplayChart candles={chart.candles} step={chart.step} scale={scale} label={label} from={from} to={to} head={head} markers={markers.length <= 120 ? markers : []} tone={runTone} bubble={head !== undefined ? usd(running, { signed: true }) : undefined} />
            {/* the time axis: the chart runs from launch to now */}
            <div className="num mt-1 flex justify-between pr-14 text-[11px] text-muted sm:pr-16">
              <span>Launched {date(token.createdAt ?? chart.candles[0]?.[0] ?? from)}</span>
              <span>Now</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2" role="status">
            {done ? (
              <VideoExport video={video} fileBase={fileBase} className="btn-primary h-11 text-[15px]" />
            ) : (
              <button type="button" onClick={replay.skip} className="btn btn-quiet h-11">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Replaying… <FastForward className="size-4" aria-hidden />
                <span className="sr-only">Skip the replay</span>
              </button>
            )}
            <button type="button" onClick={replay.play} disabled={!done} className="btn btn-quiet h-11 px-3.5" aria-label="Replay">
              <RotateCcw className="size-4" aria-hidden />
            </button>
            <button type="button" onClick={share} className="btn btn-quiet h-11 px-3.5" aria-label="Share">
              <Link2 className="size-4" aria-hidden />
            </button>
          </div>
        </section>

        {done && (
          <section className="panel rise mt-4 p-4 sm:p-5" aria-label="Result">
            <ResultCard kicker={`${short(r.owner)} on ${token.symbol}`} pnl={usd(p.pnl, { signed: true })} roi={p.roi === null ? 'no buys seen' : pct(p.roi, { signed: true })} tone={toneOf(p.pnl)} rank={rank} stats={stats} />
          </section>
        )}

        <p className="mt-3 px-1 text-[12px] leading-relaxed text-faint">
          {r.source === 'chain'
            ? `From the chain: every ${token.symbol} transfer in or out of this wallet${r.complete ? '' : ' (latest ones only)'}, priced at the candle of its time. Tokens received as gifts count as buys.`
            : `From ${token.symbol}’s latest ${r.window.trades} DEX trades (${span(r.window.to - r.window.from)}). Earlier trades by this wallet are not in that feed.`}
        </p>
      </div>
    </div>
  );
}
