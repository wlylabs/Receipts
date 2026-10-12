'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Copy, Download, FastForward, Link2, Loader2, Play, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { useReplay } from '../hooks/useReplay';
import { KEYS, RANKS, toneOf, type Recent } from '../lib/game';
import { placement, priceAt, rankOf, simulate, type SimResult } from '../lib/receipts';
import { pushRecent } from '../lib/recent';
import { MAX_PAPER, PAPER_KEY, paperPnl, type PaperTrade } from '../lib/paper';
import type { BoardRow, TokenReceipts } from '../lib/types';
import { compact, day, parseAmount, pct, price, short, span, usd } from '../lib/format';
import { ROUTES, SITE_URL } from '../lib/site';
import { copyText, saveFile, shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Failure, Loading } from './States';
import { ReplayChart, type Marker } from './ReplayChart';
import { ResultCard, type Stat } from './ResultCard';
import { VideoExport } from './VideoExport';
import type { ReplayVideo } from '../lib/replayVideo';
import { paperVerdict } from '../lib/story';
import { TokenImage } from './TokenImage';

const BAGS = [50, 100, 500, 1000];
const PLAY_MS = 3_200;

export function TokenView({ ca }: { ca: string }) {
  const { state, reload } = useApi<TokenReceipts>(`/api/token/${ca}/`);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (data) setRecent((r) => pushRecent(r, { kind: 'token', address: data.token.address, label: `$${data.token.symbol}` }));
  }, [data, setRecent]);

  if (state.status === 'loading') return <Loading what={`Loading ${short(ca)}’s chart and latest trades…`} />;
  if (state.status === 'error') return <Failure error={state.error} onRetry={reload} />;
  return <PaperTradeDesk key={ca} r={state.data} />;
}

/** A placed paper trade, frozen while it replays and after. */
interface Run {
  entry: number;
  exit: number;
  holdNow: boolean;
  amount: number;
  sim: SimResult;
  place: number;
}

function PaperTradeDesk({ r }: { r: TokenReceipts }) {
  const { token, series, board } = r;
  const last = series.length - 1;
  const athIdx = Math.max(0, series.findIndex(([ts]) => ts === r.ath.ts));
  const dipIdx = useMemo(() => {
    let k = athIdx;
    for (let i = athIdx; i <= last; i++) if (series[i]![1] < series[k]![1]) k = i;
    return k;
  }, [series, athIdx, last]);

  const [now] = useState(() => Date.now() / 1000);
  const [bag, setBag] = useState('100');
  const [entry, setEntry] = useState(0);
  const [exit, setExit] = useState(last);
  const [run, setRun] = useState<Run | null>(null);
  const [saving, setSaving] = useState(false);
  const [paper, setPaper] = useStored<PaperTrade[]>(PAPER_KEY, []);
  const replay = useReplay(PLAY_MS);
  const chartRef = useRef<HTMLElement>(null);
  const ids = { bag: useId(), entry: useId(), exit: useId() };

  const amount = parseAmount(bag);
  const bagOk = Number.isFinite(amount) && amount >= 1 && amount <= 1_000_000;
  const holdNow = exit === last;
  const sim = useMemo(() => simulate({ series, entry, exit, usd: bagOk ? amount : 0, holdNow, nowPrice: token.priceUsd }), [series, entry, exit, amount, bagOk, token, holdNow]);
  const place = placement(sim.pnl, board);

  const placeTrade = () => {
    if (!sim.ok || replay.playing) return;
    setRun({ entry, exit, holdNow, amount, sim, place });
    const trade: PaperTrade = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      chain: token.chain,
      address: token.address,
      symbol: token.symbol,
      image: token.image,
      usd: amount,
      entryTs: series[entry]![0],
      entryPrice: sim.entryPrice,
      exitTs: holdNow ? null : series[exit]![0],
      exitPrice: holdNow ? null : sim.exitPrice,
      placedAt: Date.now(),
    };
    setPaper((list) => [trade, ...list].slice(0, MAX_PAPER));
    replay.play();
    // on one column the chart sits above the ticket: bring it into view to watch
    if (!window.matchMedia('(min-width: 64rem)').matches) chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // any change to the ticket leaves the finished run behind
  const edit =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      if (!replay.playing) setRun(null);
    };
  const setEntryAt = edit((i: number) => {
    setEntry(i);
    if (exit < i) setExit(i);
  });
  const setExitAt = edit((i: number) => {
    setExit(i);
    if (entry > i) setEntry(i);
  });

  const entries = [
    { label: 'Launch', on: () => setEntryAt(0), active: entry === 0 },
    ...(athIdx > 0 ? [{ label: 'Top', on: () => setEntryAt(athIdx), active: entry === athIdx }] : []),
    ...(dipIdx > athIdx ? [{ label: 'Dip', on: () => setEntryAt(dipIdx), active: entry === dipIdx }] : []),
  ];
  const exits = [
    { label: 'Hold to now', on: () => setExitAt(last), active: exit === last },
    ...(athIdx >= entry && athIdx < last ? [{ label: 'Sell the top', on: () => setExitAt(athIdx), active: exit === athIdx }] : []),
  ];

  // what the chart shows: the placed run as it replays, or the ticket as it is being set
  const shown = run ?? (sim.ok ? { entry, exit, holdNow, amount, sim, place } : null);
  const fromTs = shown ? series[shown.entry]![0] : undefined;
  const toTs = shown ? series[shown.exit]![0] : undefined;
  const head = run && fromTs !== undefined && toTs !== undefined && replay.t < 1 ? fromTs + (toTs - fromTs) * replay.t : undefined;
  const livePnl = !shown ? 0 : head === undefined ? shown.sim.pnl : shown.sim.tokens * priceAt(series, head, token.priceUsd) - shown.amount;
  const liveTone = toneOf(livePnl);
  const finished = !!run && !replay.playing;
  const markers: Marker[] = shown
    ? [
        { ts: series[shown.entry]![0], price: shown.sim.entryPrice, kind: 'buy', label: 'Buy' },
        ...(head === undefined ? [{ ts: series[shown.exit]![0], price: shown.sim.exitPrice, kind: 'sell' as const, label: shown.holdNow ? 'Now' : 'Sell' }] : []),
      ]
    : [];

  const mine = paper.filter((p) => p.chain === token.chain && p.address === token.address);
  const closeAtMarket = (id: string) => setPaper((list) => list.map((p) => (p.id === id ? { ...p, exitTs: Math.floor(Date.now() / 1000), exitPrice: token.priceUsd } : p)));

  const rank = run ? RANKS[rankOf(run.sim.roi)] : null;
  const stats: Stat[] = run
    ? [
        { k: 'Bought', v: `${usd(run.amount)} · ${day(series[run.entry]![0])}` },
        { k: run.holdNow ? 'Worth now' : 'Sold for', v: usd(run.sim.out) },
        { k: 'Held for', v: span((run.holdNow ? now : series[run.exit]![0]) - series[run.entry]![0]) },
        { k: 'Best exit', v: usd(run.sim.bestOut) },
        { k: 'Entry', v: price(run.sim.entryPrice) },
        { k: 'vs traders', v: `#${run.place} of ${board.length + 1}` },
      ]
    : [];

  const video: ReplayVideo | null =
    run && rank
      ? (() => {
          const story = { holdNow: run.holdNow, roi: run.sim.roi, out: run.sim.out, bestOut: run.sim.bestOut, usd: run.amount };
          const buyTs = series[run.entry]![0];
          const sellTs = series[run.exit]![0];
          const peak = run.sim.bestTs > buyTs && run.sim.bestTs < sellTs ? [{ ts: run.sim.bestTs, text: `Top: ${usd(run.sim.bestOut - run.amount, { signed: true })}`, tone: 'pos' as const }] : [];
          return {
            symbol: token.symbol,
            chainName: token.chainName,
            verdict: paperVerdict(story),
            series,
            from: buyTs,
            to: sellTs,
            markers: [
              { ts: buyTs, price: run.sim.entryPrice, kind: 'buy' as const, label: 'Buy' },
              { ts: sellTs, price: run.sim.exitPrice, kind: 'sell' as const, label: run.holdNow ? 'Now' : 'Sell' },
            ],
            captions: [
              { ts: buyTs, text: `Buy ${usd(run.amount)} at ${price(run.sim.entryPrice)}`, tone: 'pos' as const },
              ...peak,
              { ts: sellTs, text: `${run.holdNow ? 'Still holding' : 'Sell'} at ${price(run.sim.exitPrice)}`, tone: toneOf(run.sim.pnl) },
            ],
            pnlAt: (ts: number) => (ts >= sellTs ? run.sim.pnl : run.sim.tokens * priceAt(series, ts, token.priceUsd) - run.amount),
            pnl: run.sim.pnl,
            pnlText: usd(run.sim.pnl, { signed: true }),
            roiText: pct(run.sim.roi, { signed: true }),
            rank,
            stats: stats.slice(0, 4),
            money: (n: number) => usd(n, { signed: true }),
            date: day,
          };
        })()
      : null;

  const share = async () => {
    if (!run) return;
    const res = await shareLink(
      `${SITE_URL}${ROUTES.token(token.address)}`,
      'Receipts',
      `Paper-traded ${usd(run.amount)} of $${token.symbol}: ${usd(run.sim.pnl, { signed: true })} (${pct(run.sim.roi, { signed: true })}), #${run.place} of ${board.length + 1} traders. Beat it:`,
    );
    if (res === 'copied') toast('Link copied.');
    else if (res === 'failed') toast('Couldn’t share. Copy the address bar instead.');
  };
  const save = async () => {
    if (!run || !rank) return;
    setSaving(true);
    try {
      const { cardPng } = await import('../lib/cardImage');
      const blob = await cardPng({
        symbol: token.symbol,
        chainName: token.chainName,
        pnl: usd(run.sim.pnl, { signed: true }),
        roi: pct(run.sim.roi, { signed: true }),
        tone: toneOf(run.sim.pnl),
        rank,
        stats: stats.slice(0, 4),
        series,
        from: series[run.entry]![0],
        to: series[run.exit]![0],
        markers: [
          { ts: series[run.entry]![0], price: run.sim.entryPrice, kind: 'buy', label: 'Buy' },
          { ts: series[run.exit]![0], price: run.sim.exitPrice, kind: 'sell', label: run.holdNow ? 'Now' : 'Sell' },
        ],
      });
      const res = await saveFile(new File([blob], `${token.symbol.toLowerCase().replace(/[^a-z0-9]/g, '') || 'token'}-paper-trade.png`, { type: 'image/png' }));
      if (res === 'saved') toast('Image saved.');
    } catch {
      toast('Couldn’t make the image. Try again.');
    } finally {
      setSaving(false);
    }
  };

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
          <p className="num text-[18px] font-semibold tracking-tight">{price(token.priceUsd)}</p>
          {token.change24h !== null && <p className={cx('num text-[12.5px] font-medium', token.change24h >= 0 ? 'text-pos' : 'text-neg')}>{pct(token.change24h / 100, { signed: true })} 24h</p>}
        </div>
      </header>
      <dl className="no-scrollbar mt-4 flex gap-5 overflow-x-auto border-y border-line py-2.5 text-[12.5px]">
        <Kv k="Mcap" v={usd(token.mcapUsd)} />
        <Kv k="Liquidity" v={usd(token.liquidityUsd)} />
        <Kv k="Vol 24h" v={usd(token.volume24hUsd)} />
        <Kv k="Age" v={token.createdAt ? span(now - token.createdAt) : '-'} />
        <Kv k="ATH" v={price(r.ath.priceUsd)} />
        <a href={token.url} target="_blank" rel="noreferrer" className="ml-auto flex shrink-0 items-center gap-1 text-muted hover:text-ink">
          DexScreener <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </dl>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* the chart, where the run plays */}
        <section ref={chartRef} className="panel scroll-mt-20 p-3 sm:p-4" aria-label="Chart">
          <div className="flex min-h-9 items-center justify-between gap-3 px-1">
            <div>
              <p className="eyebrow">{replay.playing ? 'Replaying your trade' : `${r.candle} candles · log`}</p>
              {shown && (
                <p className={cx('num text-[22px] font-semibold leading-tight tracking-tight', liveTone === 'pos' && 'text-pos', liveTone === 'neg' && 'text-neg')} aria-live="off">
                  {usd(livePnl, { signed: true })}
                </p>
              )}
            </div>
            {replay.playing && (
              <button type="button" onClick={replay.skip} className="btn btn-quiet h-8 min-h-0 px-2.5 text-[12.5px]">
                <FastForward className="size-3.5" aria-hidden /> Skip
              </button>
            )}
          </div>
          <ReplayChart
            series={series}
            from={fromTs}
            to={toTs}
            head={head}
            markers={markers}
            tone={liveTone}
            bubble={head !== undefined ? price(priceAt(series, head, token.priceUsd)) : undefined}
            athTs={r.ath.ts}
            className="mt-3"
          />

          {finished && run && rank && (
            <div className="mt-4 border-t border-line px-1 pt-4" role="status">
              <ResultCard kicker={`Paper trade · ${token.symbol}`} pnl={usd(run.sim.pnl, { signed: true })} roi={pct(run.sim.roi, { signed: true })} tone={toneOf(run.sim.pnl)} rank={rank} stats={stats}>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button type="button" onClick={replay.play} className="btn btn-quiet">
                    <RotateCcw className="size-4" aria-hidden /> Replay
                  </button>
                  {video && <VideoExport video={video} fileBase={`${token.symbol.toLowerCase().replace(/[^a-z0-9]/g, '') || 'token'}-paper-trade`} />}
                  <button type="button" onClick={save} disabled={saving} className="btn btn-quiet">
                    {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                    Image
                  </button>
                  <button type="button" onClick={share} className="btn btn-primary">
                    <Link2 className="size-4" aria-hidden /> Challenge
                  </button>
                </div>
              </ResultCard>
            </div>
          )}
        </section>

        {/* the order ticket */}
        <section className="panel p-4" aria-label="Paper trade">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold">Paper buy</p>
            <span className="rounded-md bg-pos-wash px-2 py-0.5 text-[11.5px] font-semibold text-pos">Pretend money</span>
          </div>

          <label htmlFor={ids.bag} className="eyebrow mt-4 block">
            Amount
          </label>
          <div className={cx('field mt-1.5 h-11 px-3', !bagOk && bag !== '' && 'border-neg')}>
            <span className="text-[15px] text-muted">$</span>
            <input
              id={ids.bag}
              value={bag}
              onChange={(e) => edit(setBag)(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              className="num h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none"
              aria-invalid={!bagOk}
            />
            <span className="text-[12.5px] text-muted">USD</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {BAGS.map((b) => (
              <Chip key={b} on={bagOk && amount === b} onClick={() => edit(setBag)(String(b))}>
                ${compact(b)}
              </Chip>
            ))}
          </div>

          <Scrub id={ids.entry} label="Buy at" value={entry} max={last} onChange={setEntryAt} thumb="var(--pos)" detail={`${day(series[entry]![0])} · ${price(series[entry]![1])}`} chips={entries} />
          <Scrub
            id={ids.exit}
            label="Sell at"
            value={exit}
            max={last}
            onChange={setExitAt}
            thumb="var(--neg)"
            detail={holdNow ? `Now · ${price(token.priceUsd)}` : `${day(series[exit]![0])} · ${price(series[exit]![1])}`}
            chips={exits}
          />

          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[13px]">
            <Row k="Tokens" v={sim.ok ? compact(sim.tokens) : '-'} />
            <Row k="Value at exit" v={sim.ok ? usd(sim.out) : '-'} />
            <Row k="Rank" v={sim.ok ? `#${place} of ${board.length + 1}` : '-'} />
          </dl>

          <button type="button" onClick={placeTrade} disabled={!sim.ok || replay.playing} className="btn btn-primary mt-4 h-11 w-full text-[14.5px]">
            {replay.playing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {replay.playing ? 'Replaying…' : 'Place paper trade'}
          </button>
          <p className="mt-2.5 text-[11.5px] leading-snug text-faint">At candle close prices. DEX fees, taxes and slippage not included.</p>
        </section>
      </div>

      <Board r={r} mine={mine.length}>
        {(more) => (
          <div className="panel mt-2 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <Th>Bought</Th>
                  <Th>Size</Th>
                  <Th wide>Entry</Th>
                  <Th>Exit</Th>
                  <Th right>P&L</Th>
                  <Th right>
                    <span className="sr-only">Action</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(more ? mine : mine.slice(0, ROWS)).map((p) => {
                  const pnl = paperPnl(p, token.priceUsd) ?? 0;
                  return (
                    <tr key={p.id}>
                      <Td>{day(p.entryTs)}</Td>
                      <Td>{usd(p.usd)}</Td>
                      <Td wide>{price(p.entryPrice)}</Td>
                      <Td>{p.exitPrice ? price(p.exitPrice) : <span className="text-muted">Open</span>}</Td>
                      <Td right>
                        <span className={cx('font-medium', pnl > 0 ? 'text-pos' : pnl < 0 && 'text-neg')}>{usd(pnl, { signed: true })}</span>
                      </Td>
                      <Td right>
                        {p.exitPrice === null ? (
                          <button type="button" onClick={() => closeAtMarket(p.id)} className="btn btn-quiet h-7 min-h-0 px-2.5 text-[12px]">
                            Close
                          </button>
                        ) : (
                          <span className="text-faint">Closed</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Board>
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="num text-right">{v}</dd>
    </div>
  );
}

function Th({ children, right, wide }: { children: React.ReactNode; right?: boolean; wide?: boolean }) {
  return <th className={cx('px-3 py-2 text-[12px] font-medium', right && 'text-right', wide && 'hidden sm:table-cell')}>{children}</th>;
}
function Td({ children, right, wide }: { children: React.ReactNode; right?: boolean; wide?: boolean }) {
  return <td className={cx('num whitespace-nowrap px-3 py-2.5', right && 'text-right', wide && 'hidden sm:table-cell')}>{children}</td>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx('num h-8 shrink-0 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors', on ? 'border-ink bg-ink text-on-ink' : 'border-line bg-surface text-ink-2 hover:bg-hover')}
    >
      {children}
    </button>
  );
}

function Scrub({
  id,
  label,
  value,
  max,
  onChange,
  thumb,
  detail,
  chips,
}: {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  thumb: string;
  detail: string;
  chips: { label: string; on: () => void; active: boolean }[];
}) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="eyebrow">
          {label}
        </label>
        <span className="num truncate text-[12.5px] text-ink-2">{detail}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="scrub mt-1"
        style={{ ['--thumb' as string]: thumb }}
        aria-valuetext={detail}
      />
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {chips.map((c) => (
          <Chip key={c.label} on={c.active} onClick={c.on}>
            {c.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Rows shown before "show all", so the page ends near the ticket. */
const ROWS = 5;
/** Wallets shown on each side of the board. */
const SIDE = 3;

/** The traders' board (winners beside losers) and this browser's own trades on the token, one tab at a time. */
function Board({ r, mine, children }: { r: TokenReceipts; mine: number; children: (more: boolean) => React.ReactNode }) {
  const [tab, setTab] = useState<'traders' | 'mine'>(mine > 0 ? 'mine' : 'traders');
  const [more, setMore] = useState(false);
  const side = tab === 'mine' && mine === 0 ? 'traders' : tab;
  const winners = r.board.filter((w) => w.pnl > 0).slice(0, SIDE);
  const losers = r.board.filter((w) => w.pnl < 0).reverse().slice(0, SIDE);
  const total = side === 'mine' ? mine : 0;
  const tabs = [
    { id: 'traders' as const, label: 'Traders' },
    ...(mine > 0 ? [{ id: 'mine' as const, label: `Mine · ${mine}` }] : []),
  ];
  return (
    <section className="mt-6" aria-labelledby="board-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="board-title" className="text-[14px] font-semibold">
            {side === 'mine' ? `My ${r.token.symbol} paper trades` : 'Recent traders'}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {side === 'mine' ? 'Kept in this browser.' : `${r.board.length} wallets in the latest ${r.window.trades} trades (${span(r.window.to - r.window.from)}). Tap one to replay its trades.`}
          </p>
        </div>
        {tabs.length > 1 && (
          <div role="tablist" aria-label="List" className="flex rounded-lg bg-subtle p-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={side === t.id}
                onClick={() => {
                  setTab(t.id);
                  setMore(false);
                }}
                className={cx('h-8 rounded-md px-3 text-[12.5px] font-medium', side === t.id ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {side === 'mine' ? (
        children(more)
      ) : r.board.length === 0 ? (
        <p className="panel mt-2 px-4 py-6 text-[13px] text-muted">No recent trades in the feed.</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
          <Side title="Top gainers" tone="pos" rows={winners} empty="Nobody in profit yet." token={r.token.address} />
          <Side title="Biggest losers" tone="neg" rows={losers} empty="Nobody down yet." token={r.token.address} />
        </div>
      )}
      {total > ROWS && (
        <button type="button" onClick={() => setMore((m) => !m)} className="mt-2 w-full py-2 text-[13px] text-muted hover:text-ink">
          {more ? 'Show less' : `Show all ${total}`}
        </button>
      )}
    </section>
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
