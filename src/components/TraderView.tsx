'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Download, FastForward, Link2, Loader2, RotateCcw } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { useReplay } from '../hooks/useReplay';
import { KEYS, RANKS, toneOf, type Recent } from '../lib/game';
import { position, priceAt, rankOf } from '../lib/receipts';
import { pushRecent } from '../lib/recent';
import { CHAINS } from '../lib/chains';
import type { Trade, TraderReceipts } from '../lib/types';
import { compact, dateTime, day, pct, price, short, span, usd } from '../lib/format';
import { ROUTES, SITE_URL } from '../lib/site';
import { saveFile, shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Failure, Loading } from './States';
import { Holdings } from './Holdings';
import { ReplayChart, type Marker } from './ReplayChart';
import { ResultCard, type Stat } from './ResultCard';
import { VideoExport } from './VideoExport';
import type { ReplayVideo } from '../lib/replayVideo';
import { walletVerdict } from '../lib/story';
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
  const [saving, setSaving] = useState(false);
  // the replay starts as soon as the page opens
  const replay = useReplay(PLAY_MS, true);

  const p = r.position;
  const { token, series: full } = r;
  const chain = CHAINS[token.chain];
  const trades: Trade[] = useMemo(() => r.trades.map(([ts, side, tokens, u, pr, tx]) => ({ ts, side, tokens, usd: u, priceUsd: pr, tx, trader: r.owner })), [r]);

  // the replay runs from the wallet's first trade to now, the chart zoomed in on that stretch
  const from = Math.max(full[0]?.[0] ?? 0, (trades[0]?.ts ?? 0) - 60);
  const to = Math.max(full.at(-1)?.[0] ?? 0, trades.at(-1)?.ts ?? 0);
  const series = useMemo(() => {
    const lead = from - (to - from) * 0.2;
    const view = full.filter(([ts]) => ts >= lead);
    return view.length >= 12 ? view : full.slice(-12);
  }, [full, from, to]);
  const done = !replay.playing;
  const head = replay.t < 1 ? from + (to - from) * replay.t : undefined;
  const running = useMemo(() => {
    if (head === undefined) return p.pnl;
    const seen = trades.filter((t) => t.ts <= head);
    return seen.length ? position(seen, priceAt(series, head, token.priceUsd)).pnl : 0;
  }, [head, trades, series, token.priceUsd, p.pnl]);
  const runTone = toneOf(running);
  const rank = RANKS[rankOf(p.roi)];
  const stats: Stat[] = [
    { k: 'Put in', v: usd(p.usdIn) },
    { k: 'Took out', v: usd(p.usdOut) },
    { k: 'Bag now', v: usd(p.openValue) },
    { k: 'Trades', v: `${p.buys} buys · ${p.sells} sells` },
    { k: 'Realized', v: usd(p.realized, { signed: true }), tone: toneOf(p.realized) },
    { k: 'Unrealized', v: usd(p.unrealized, { signed: true }), tone: toneOf(p.unrealized) },
    ...(p.missedUsd > 0.005 ? [{ k: 'Sold before top', v: `-${usd(p.missedUsd)}`, tone: 'neg' as const }] : []),
    ...(r.of > 1 ? [{ k: 'vs traders', v: `#${r.place} of ${r.of}` }] : []),
  ];

  const share = async () => {
    const res = await shareLink(`${SITE_URL}${ROUTES.trader(r.owner, token.address)}`, 'Receipts', `Replayed ${short(r.owner)} on $${token.symbol}: ${usd(p.pnl, { signed: true })}. Rank: ${rank.name}.`);
    if (res === 'copied') toast('Link copied.');
    else if (res === 'failed') toast('Couldn’t share. Copy the address bar instead.');
  };

  const fileBase = `${r.owner.slice(0, 6)}-${token.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'token'}`;
  const markers: Marker[] = trades.map((t) => ({ ts: t.ts, price: t.priceUsd, kind: t.side }));
  const money = (n: number) => usd(n, { signed: true });
  const story = { buys: p.buys, sells: p.sells, usdIn: p.usdIn, pnl: p.pnl, roi: p.roi, realized: p.realized, unrealized: p.unrealized, openValue: p.openValue, missedUsd: p.missedUsd };
  const video: ReplayVideo = {
    kicker: short(r.owner),
    symbol: token.symbol,
    chainName: token.chainName,
    verdict: walletVerdict(story, (n) => usd(n)),
    series,
    from,
    to,
    markers: markers.length <= 60 ? markers : [],
    captions: trades.map((t) => ({ ts: t.ts, text: `${t.side === 'buy' ? 'Buy' : 'Sell'} ${usd(t.usd)} at ${price(t.priceUsd)}`, tone: t.side === 'buy' ? ('pos' as const) : ('neg' as const) })),
    pnlAt: (ts) => {
      if (ts >= to) return p.pnl;
      const seen = trades.filter((t) => t.ts <= ts);
      return seen.length ? position(seen, priceAt(series, ts, token.priceUsd)).pnl : 0;
    },
    pnl: p.pnl,
    pnlText: usd(p.pnl, { signed: true }),
    roiText: p.roi === null ? null : pct(p.roi, { signed: true }),
    rank,
    stats: stats.slice(0, 4),
    money,
    date: day,
  };

  const save = async () => {
    setSaving(true);
    try {
      const { cardPng } = await import('../lib/cardImage');
      const blob = await cardPng({
        kicker: `WALLET ${short(r.owner)}`,
        symbol: token.symbol,
        chainName: token.chainName,
        pnl: usd(p.pnl, { signed: true }),
        roi: p.roi === null ? null : pct(p.roi, { signed: true }),
        tone: toneOf(p.pnl),
        rank,
        stats: stats.slice(0, 4),
        series,
        from,
        to,
        markers: markers.length <= 60 ? markers : [],
      });
      const res = await saveFile(new File([blob], `${fileBase}.png`, { type: 'image/png' }));
      if (res === 'saved') toast('Image saved.');
    } catch {
      toast('Couldn’t make the image. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <p className="eyebrow">Wallet · {token.chainName}</p>
          <h1 className="num truncate text-[20px] font-semibold tracking-tight" title={r.owner}>
            {short(r.owner)}
          </h1>
        </div>
        <Link href={ROUTES.wallet(r.owner)} className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
          Other tokens
        </Link>
        {chain && (
          <a href={chain.account(r.owner)} target="_blank" rel="noreferrer" className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
            Explorer <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        )}
      </header>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* the chart, where the wallet's trades replay */}
        <section className="panel p-3 sm:p-4" aria-label="Replay">
          <div className="flex min-h-9 items-center justify-between gap-3 px-1">
            <Link href={ROUTES.token(token.address)} className="flex min-w-0 items-center gap-2">
              <TokenImage src={token.image} symbol={token.symbol} className="size-7 text-xs" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{token.symbol}</span>
                <span className="block truncate text-[12px] text-muted">
                  {price(token.priceUsd)} · {r.candle} candles
                </span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <p className={cx('num text-[20px] font-semibold tracking-tight', runTone === 'pos' && 'text-pos', runTone === 'neg' && 'text-neg')}>{usd(running, { signed: true })}</p>
              {replay.playing && (
                <button type="button" onClick={replay.skip} className="btn btn-quiet h-8 min-h-0 px-2.5 text-[12.5px]" aria-label="Skip the replay">
                  <FastForward className="size-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="relative mt-3">
            <ReplayChart series={series} from={from} to={to} head={head} markers={markers.length <= 120 ? markers : []} tone={runTone} bubble={head !== undefined ? usd(running, { signed: true }) : undefined} />
          </div>

          {done && (
            <div className="mt-4 border-t border-line px-1 pt-4" role="status">
              <ResultCard kicker={`${short(r.owner)} on ${token.symbol}`} pnl={usd(p.pnl, { signed: true })} roi={p.roi === null ? 'no buys seen' : pct(p.roi, { signed: true })} tone={toneOf(p.pnl)} rank={rank} stats={stats}>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button type="button" onClick={replay.play} className="btn btn-quiet">
                    <RotateCcw className="size-4" aria-hidden /> Replay
                  </button>
                  <button type="button" onClick={save} disabled={saving} className="btn btn-quiet">
                    {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                    Image
                  </button>
                  <button type="button" onClick={share} className="btn btn-quiet">
                    <Link2 className="size-4" aria-hidden /> Share
                  </button>
                </div>
              </ResultCard>
            </div>
          )}
        </section>

        {/* the video */}
        <section className="space-y-4" aria-label="Video">
          <div className="panel p-4 sm:p-5">
            {!done ? (
              <p className="flex items-center gap-2 text-[15px] font-medium" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Replaying…
              </p>
            ) : (
              <div className="rise" role="status">
                <h2 className="text-[20px] font-semibold tracking-tight">Make the video</h2>
                <p className="mt-1 text-[13.5px] text-muted">
                  {short(r.owner)} on {token.symbol}: {usd(p.pnl, { signed: true })}. Pick a size and length, then download it.
                </p>
                <div className="mt-4 grid gap-2">
                  <VideoExport video={video} fileBase={fileBase} className="btn-primary h-12 text-[15px]" />
                  <Link href={ROUTES.token(token.address)} className="btn btn-quiet">
                    <ArrowLeft className="size-4" aria-hidden /> Other {token.symbol} traders
                  </Link>
                </div>
              </div>
            )}
          </div>
          <p className="text-[12.5px] leading-relaxed text-muted">
            {r.source === 'chain'
              ? `From the chain: every ${token.symbol} transfer in or out of this wallet${r.complete ? '' : ' (latest ones only)'}, priced at the candle of its time. Tokens received as gifts count as buys.`
              : `From ${token.symbol}’s latest ${r.window.trades} DEX trades (${span(r.window.to - r.window.from)}). Earlier trades by this wallet are not in that feed.`}
          </p>
        </section>
      </div>

      {done && (
        <section className="mt-6" aria-labelledby="trades">
          <h2 id="trades" className="text-[14px] font-semibold">
            Trades
          </h2>
          <div className="panel mt-2 max-h-96 overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface text-left text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 text-[12px] font-medium">Side</th>
                  <th className="px-3 py-2 text-[12px] font-medium">Time</th>
                  <th className="hidden px-3 py-2 text-right text-[12px] font-medium sm:table-cell">Tokens</th>
                  <th className="px-3 py-2 text-right text-[12px] font-medium">Value</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Transaction</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...trades].reverse().map((t, i) => (
                  <tr key={`${t.tx}:${i}`}>
                    <td className={cx('px-3 py-2 font-medium', t.side === 'buy' ? 'text-pos' : 'text-neg')}>{t.side === 'buy' ? 'Buy' : 'Sell'}</td>
                    <td className="num whitespace-nowrap px-3 py-2 text-muted">{dateTime(t.ts)}</td>
                    <td className="num hidden px-3 py-2 text-right sm:table-cell">{compact(t.tokens)}</td>
                    <td className="num px-3 py-2 text-right">{usd(t.usd)}</td>
                    <td className="px-3 py-2 text-right">
                      {chain && (
                        <a href={chain.tx(t.tx)} target="_blank" rel="noreferrer" className="text-faint hover:text-ink" aria-label="Open the transaction in the explorer">
                          <ArrowUpRight className="inline size-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
