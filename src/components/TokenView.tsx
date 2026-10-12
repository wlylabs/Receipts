'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, Link2, Loader2, Play, RotateCcw, Trophy } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { KEYS, RANKS, stampOf, toneOf, type Recent } from '../lib/game';
import { placement, rankOf, simulate, type SimResult } from '../lib/receipts';
import { pushRecent } from '../lib/recent';
import type { ReceiptDoc } from '../lib/receiptDoc';
import type { TokenReceipts } from '../lib/types';
import { compact, dateTime, day, parseAmount, pct, short, sol, span, tinyPrice, usd } from '../lib/format';
import { bordrlessToken, ROUTES, SITE_HOST, SITE_URL } from '../lib/site';
import { saveFile, shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Receipt } from './Receipt';
import { Failure, Printing } from './States';
import { PriceChart, type Marker } from './PriceChart';
import { TokenImage } from './TokenImage';

const BAGS = ['0.1', '0.5', '1', '5', '10'];
const PLAY_MS = 2_600;

interface Best {
  pnl: number;
  roi: number;
  place: number;
  of: number;
}

export function TokenView({ ca }: { ca: string }) {
  const { state, reload } = useApi<TokenReceipts>(`/api/token/${ca}/`);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (data) setRecent((r) => pushRecent(r, { kind: 'token', address: ca, label: `$${data.token.symbol}` }));
  }, [data, ca, setRecent]);

  if (state.status === 'loading') return <Printing what={`Reading every trade on ${short(ca)} since launch`} />;
  if (state.status === 'error') return <Failure error={state.error} onRetry={reload} />;
  return <ApeGame key={ca} r={state.data} />;
}

function ApeGame({ r }: { r: TokenReceipts }) {
  const { token, series, board, stats } = r;
  const last = series.length - 1;
  const athIdx = Math.max(0, series.findIndex(([ts]) => ts === r.ath.ts));
  const dipIdx = useMemo(() => {
    let k = athIdx;
    for (let i = athIdx; i <= last; i++) if (series[i]![1] < series[k]![1]) k = i;
    return k;
  }, [series, athIdx, last]);

  const [now] = useState(() => Date.now() / 1000);
  const [bag, setBag] = useState('1');
  const [entry, setEntry] = useState(0);
  const [exit, setExit] = useState(last);
  const [phase, setPhase] = useState<'setup' | 'playing' | 'done'>('setup');
  const [reveal, setReveal] = useState(0);
  const [shown, setShown] = useState(0);
  const [saving, setSaving] = useState(false);
  const [best, setBest] = useStored<Best | null>(KEYS.best(token.mint), null);
  const [newBest, setNewBest] = useState(false);
  const ids = { bag: useId(), entry: useId(), exit: useId() };
  const resultRef = useRef<HTMLDivElement>(null);

  const amount = parseAmount(bag);
  const bagOk = Number.isFinite(amount) && amount >= 0.01 && amount <= 1000;
  const holdNow = exit === last;
  const sim: SimResult = useMemo(
    () => simulate({ series, entry, exit, sol: bagOk ? amount : 0, buyFeeBps: token.buyFeeBps, sellFeeBps: token.sellFeeBps, holdNow, nowPriceSol: token.priceSol }),
    [series, entry, exit, amount, bagOk, token, holdNow],
  );
  const place = placement(sim.pnl, board);
  const doc = useMemo(() => (sim.ok ? simDoc(r, sim, entry, exit, holdNow, place, amount) : null), [r, sim, entry, exit, holdNow, place, amount]);
  const lines = doc?.lines.length ?? 0;

  // the replay walks the held stretch, then the receipt prints
  useEffect(() => {
    if (phase !== 'playing') return;
    if (reveal < exit) {
      const steps = Math.max(1, exit - entry);
      const jump = Math.max(1, Math.ceil(steps / 60));
      const id = setTimeout(() => setReveal((v) => Math.min(exit, v + jump)), PLAY_MS / Math.ceil(steps / jump));
      return () => clearTimeout(id);
    }
    if (shown < lines) {
      const id = setTimeout(() => setShown((s) => s + 1), 80);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the run ends when the last line prints
    setPhase('done');
  }, [phase, reveal, exit, entry, shown, lines]);

  useEffect(() => {
    if (phase !== 'done' || !sim.ok) return;
    const better = !best || sim.pnl > best.pnl;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shown once with the result
    setNewBest(better);
    if (better) setBest({ pnl: sim.pnl, roi: sim.roi, place, of: board.length + 1 });
    // only when a run finishes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const play = () => {
    if (!sim.ok) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReveal(reduced ? exit : entry);
    setShown(reduced ? lines : 0);
    setNewBest(false);
    setPhase('playing');
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    if (phase !== 'setup') setPhase('setup');
  };
  const setEntryAt = edit((i: number) => {
    setEntry(i);
    if (exit < i) setExit(i);
  });
  const setExitAt = edit((i: number) => {
    setExit(i);
    if (entry > i) setEntry(i);
  });

  const presets: { label: string; on: () => void; active: boolean }[] = [
    { label: 'First buyer', on: () => setEntryAt(0), active: entry === 0 },
    { label: 'Bought the top', on: () => setEntryAt(athIdx), active: entry === athIdx && athIdx > 0 },
    ...(dipIdx > athIdx ? [{ label: 'Bought the dip', on: () => setEntryAt(dipIdx), active: entry === dipIdx }] : []),
  ];
  const exits: { label: string; on: () => void; active: boolean }[] = [
    { label: 'Still holding', on: () => setExitAt(last), active: exit === last },
    ...(athIdx >= entry && athIdx < last ? [{ label: 'Sold the top', on: () => setExitAt(athIdx), active: exit === athIdx }] : []),
  ];

  const playing = phase === 'playing';
  const showRun = phase !== 'setup';
  const markers: Marker[] = sim.ok
    ? [
        { ts: series[entry]![0], price: series[entry]![1], kind: 'entry' },
        ...(showRun && reveal < exit ? [] : [{ ts: series[exit]![0], price: holdNow ? token.priceSol : series[exit]![1], kind: 'exit' as const }]),
      ]
    : [];
  const live = showRun ? sim.path[Math.max(0, Math.min(sim.path.length - 1, reveal - entry))] : null;
  const runTone = toneOf(showRun ? (live?.pnl ?? 0) : sim.pnl);

  const share = async () => {
    const res = await shareLink(
      `${SITE_URL}${ROUTES.token(token.mint)}`,
      'Receipts',
      `Aped ${sol(amount)} into $${token.symbol}: ${sol(sim.pnl, { signed: true })} (${pct(sim.roi, { signed: true })}). #${place} of ${board.length + 1} traders. Beat it:`,
    );
    if (res === 'copied') toast('Link copied.');
    else if (res === 'failed') toast('Couldn’t share. Copy the address bar instead.');
  };
  const save = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const { receiptPng } = await import('../lib/receiptImage');
      const blob = await receiptPng(doc, SITE_HOST);
      const res = await saveFile(new File([blob], `receipt-${token.symbol.toLowerCase().replace(/[^a-z0-9]/g, '') || 'token'}.png`, { type: 'image/png' }));
      if (res === 'saved') toast('Receipt saved.');
    } catch {
      toast('Couldn’t make the image. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10">
      {/* the token */}
      <header className="flex items-center gap-3 sm:gap-4">
        <TokenImage src={token.image} symbol={token.symbol} className="size-12 text-xl sm:size-14" />
        <div className="min-w-0 flex-1">
          <p className="label text-muted">Ape simulator</p>
          <h1 className="truncate text-2xl font-bold leading-tight sm:text-3xl">
            ${token.symbol} <span className="text-base font-medium text-muted sm:text-lg">{token.name}</span>
          </h1>
        </div>
        <a href={bordrlessToken(token.mint)} target="_blank" rel="noreferrer" className="btn btn-ghost h-9 min-h-0 shrink-0 px-3 text-sm">
          <span className="hidden sm:inline">bordrless</span> <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </header>
      <dl className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-6 sm:px-0">
        <Stat k="Price" v={usd(token.priceUsd)} />
        <Stat k="Mcap" v={usd(token.mcapUsd)} />
        <Stat k="Holders" v={compact(token.holders)} />
        <Stat k="Traders" v={compact(stats.traders)} />
        <Stat k="Volume" v={`${compact(stats.volumeSol)} SOL`} />
        <Stat k="Age" v={span(now - token.createdAt)} />
      </dl>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10">
        <section className="card p-4 sm:p-6" aria-label="Your trade">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label text-muted">Price since launch · log scale</p>
            <p className={cx('num text-sm font-bold', runTone === 'pos' && 'text-pos', runTone === 'neg' && 'text-neg')} aria-live="polite">
              {sim.ok ? `${sol(showRun ? (live?.pnl ?? 0) : sim.pnl, { signed: true })}` : '—'}
            </p>
          </div>
          <PriceChart
            series={series}
            markers={markers}
            range={sim.ok ? [entry, exit] : undefined}
            reveal={showRun ? reveal : exit}
            tone={runTone}
            athTs={r.ath.ts}
            className="mt-3"
          />

          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor={ids.bag} className="flex items-baseline justify-between text-[15px] font-semibold">
                Your bag
                {sim.ok && <span className="num text-[13px] font-normal text-muted">≈ {compact(sim.tokens)} ${token.symbol}</span>}
              </label>
              <div className={cx('mt-2 flex items-center rounded-[14px] border bg-surface-2 px-3.5 focus-within:border-ink', bagOk || !bag ? 'border-line' : 'border-neg')}>
                <input
                  id={ids.bag}
                  value={bag}
                  onChange={(e) => edit(setBag)(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  className="num h-12 min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
                  aria-invalid={!bagOk}
                />
                <span className="num text-sm font-semibold text-muted">SOL</span>
              </div>
              <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
                {BAGS.map((b) => (
                  <Chip key={b} on={bagOk && amount === Number(b)} onClick={() => edit(setBag)(b)}>
                    {b}
                  </Chip>
                ))}
              </div>
              {!bagOk && bag !== '' && <p className="mt-1.5 text-[13px] text-neg">Between 0.01 and 1,000 SOL.</p>}
            </div>

            <Scrub
              id={ids.entry}
              label="Buy at"
              value={entry}
              max={last}
              onChange={setEntryAt}
              thumb="var(--hi)"
              detail={`${day(series[entry]![0])} · ${tinyPrice(series[entry]![1])} SOL`}
              chips={presets}
            />
            <Scrub
              id={ids.exit}
              label="Sell at"
              value={exit}
              max={last}
              onChange={setExitAt}
              thumb="var(--ink)"
              detail={holdNow ? `Now · ${tinyPrice(token.priceSol)} SOL` : `${day(series[exit]![0])} · ${tinyPrice(series[exit]![1])} SOL`}
              chips={exits}
            />

            <button type="button" onClick={play} disabled={!sim.ok || playing} className="btn btn-hi h-14 w-full text-lg">
              {playing ? <Loader2 className="size-5 animate-spin" aria-hidden /> : phase === 'done' ? <RotateCcw className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
              {phase === 'done' ? 'Run it again' : 'Print my receipt'}
            </button>
            <p className="text-[13px] leading-snug text-muted">
              Buys and sells at the price real traders paid at that moment, with ${token.symbol}’s own fees ({pct(token.buyFeeBps / 10_000)} in, {pct(token.sellFeeBps / 10_000)} out). A big bag
              would move a small pool more than this shows.
              {!r.complete && ' The oldest trades were too many to read, so the chart starts later than launch.'}
            </p>
          </div>
        </section>

        <div ref={resultRef} className="scroll-mt-20 space-y-4">
          {best && (
            <div className="card flex items-center gap-3 px-4 py-3">
              <Trophy className="size-5 shrink-0 text-[#c98a00]" aria-hidden />
              <p className="min-w-0 flex-1 text-sm">
                Your best on ${token.symbol}: <b className={cx('num', best.pnl > 0 ? 'text-pos' : 'text-neg')}>{sol(best.pnl, { signed: true })}</b>{' '}
                <span className="text-muted">
                  · #{best.place} of {best.of}
                </span>
              </p>
              {newBest && phase === 'done' && <span className="label pop rounded-full bg-hi px-2 py-1 text-hi-ink">New best</span>}
            </div>
          )}
          <div className="pt-3 pb-3">
            {showRun && doc ? (
              <Receipt doc={doc} shown={reveal >= exit ? shown : 0} />
            ) : (
              <div className="paper mx-auto grid w-full max-w-[400px] place-items-center px-6 py-14 text-center">
                <div>
                  <p className="text-xl font-extrabold tracking-[0.18em]">RECEIPTS</p>
                  <p className="mt-2 text-[13px] text-[#6e6a60]">Set your bag, entry and exit, then print.</p>
                  <p className={cx('num mt-6 text-4xl font-extrabold', sim.ok ? 'text-[#d9d3c4]' : 'text-[#e3ddcf]')}>{sim.ok ? '±' : '—'}</p>
                </div>
              </div>
            )}
          </div>
          {phase === 'done' && (
            <div className="pop grid grid-cols-2 gap-2">
              <p className="col-span-2 text-center text-[15px]">
                You’d place <b className="num">#{place}</b> of <b className="num">{board.length + 1}</b> traders on ${token.symbol}.
              </p>
              <button type="button" onClick={save} disabled={saving} className="btn btn-ghost">
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                Save image
              </button>
              <button type="button" onClick={share} className="btn btn-ghost">
                <Link2 className="size-4" aria-hidden /> Challenge
              </button>
            </div>
          )}
        </div>
      </div>

      <Board r={r} you={phase === 'done' ? sim.pnl : null} />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-28 shrink-0 rounded-xl border border-line bg-surface px-3 py-2 sm:min-w-0">
      <dt className="label text-muted">{k}</dt>
      <dd className="num truncate font-bold">{v}</dd>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx('num h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors', on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface-2 text-ink hover:border-muted')}
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
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-[15px] font-semibold">
        {label}
        <span className="num truncate text-[13px] font-normal text-muted">{detail}</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="scrub"
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

function Board({ r, you }: { r: TokenReceipts; you: number | null }) {
  const [side, setSide] = useState<'top' | 'worst'>('top');
  const rows = side === 'top' ? r.board.slice(0, 10) : [...r.board].reverse().slice(0, 10);
  const n = r.board.length;
  return (
    <section className="mt-10" aria-labelledby="board-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="board-title" className="text-xl font-bold tracking-tight sm:text-2xl">
            Real receipts on ${r.token.symbol}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {n} wallets · {r.stats.trades.toLocaleString('en-US')} trades · bags valued at today’s price
          </p>
        </div>
        <div role="tablist" aria-label="Board" className="flex rounded-[12px] border border-line bg-surface-2 p-1">
          {(['top', 'worst'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => setSide(s)}
              className={cx('h-9 rounded-[9px] px-4 text-sm font-semibold', side === s ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted')}
            >
              {s === 'top' ? 'Biggest wins' : 'Biggest L’s'}
            </button>
          ))}
        </div>
      </div>
      <ol className="card mt-4 divide-y divide-line overflow-hidden">
        {rows.map((row) => {
          const rank = r.board.indexOf(row) + 1;
          const tone = toneOf(row.pnl);
          return (
            <li key={row.trader}>
              <Link href={ROUTES.trader(row.trader)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                <span className="num w-10 shrink-0 text-sm font-bold text-muted">#{rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="num block truncate font-semibold">{short(row.trader)}</span>
                  <span className="block text-[12.5px] text-muted">
                    {row.trades} trades · in {sol(row.solIn)}
                  </span>
                </span>
                <span className="text-right">
                  <span className={cx('num block font-bold', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{sol(row.pnl, { signed: true })}</span>
                  <span className="num block text-[12.5px] text-muted">{pct(row.roi, { signed: true })}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ol>
      {you !== null && (
        <p className="mt-3 text-sm text-muted">
          Your run would sit at <b className="num text-ink">#{placement(you, r.board)}</b>. Tap a wallet to call its receipt.
        </p>
      )}
    </section>
  );
}

function simDoc(r: TokenReceipts, s: SimResult, entry: number, exit: number, holdNow: boolean, place: number, bag: number): ReceiptDoc {
  const { token, series } = r;
  const rank = RANKS[rankOf(s.roi)];
  const held = series[exit]![0] - series[entry]![0];
  return {
    lines: [
      { t: 'title', text: 'RECEIPTS' },
      { t: 'center', text: `APE SIMULATOR · $${token.symbol}`, muted: true },
      { t: 'center', text: dateTime(Date.now() / 1000), muted: true },
      { t: 'dash' },
      { t: 'row', left: 'BUY', right: sol(bag) },
      { t: 'row', left: '  ON', right: day(series[entry]![0]), muted: true },
      { t: 'row', left: '  AT', right: `${tinyPrice(s.entryPrice)} SOL`, muted: true },
      { t: 'row', left: 'TOKENS', right: compact(s.tokens) },
      { t: 'row', left: holdNow ? 'HELD TO' : 'SELL', right: holdNow ? 'NOW' : day(series[exit]![0]) },
      { t: 'row', left: '  AT', right: `${tinyPrice(s.exitPrice)} SOL`, muted: true },
      { t: 'row', left: 'HELD FOR', right: span(holdNow ? Date.now() / 1000 - series[entry]![0] : held) },
      { t: 'row', left: 'FEES', right: `-${sol(s.fees)}`, tone: 'neg' },
      { t: 'dash' },
      { t: 'row', left: holdNow ? 'BAG WORTH NOW' : 'SOLD FOR', right: sol(s.out) },
      { t: 'row', left: 'BEST EXIT WAS', right: `${sol(s.bestOut)} · ${day(s.bestTs)}`, muted: true },
      { t: 'dash' },
      { t: 'total', left: 'P&L', right: sol(s.pnl, { signed: true }), sub: `${usd(s.pnl * r.solUsd, { signed: true })} · ${pct(s.roi, { signed: true })}`, tone: toneOf(s.pnl) },
      { t: 'row', left: 'VS REAL TRADERS', right: `#${place} of ${r.board.length + 1}` },
      { t: 'rank', name: rank.name, line: rank.line },
      { t: 'barcode', seed: `${token.mint}:${entry}:${exit}` },
      { t: 'center', text: SITE_HOST, muted: true },
      { t: 'center', text: 'a game · not financial advice', muted: true },
    ],
    stamp: stampOf(s.pnl),
  };
}
