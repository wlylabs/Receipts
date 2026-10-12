'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, Link2, Loader2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { KEYS, RANKS, stampOf, toneOf, type Recent } from '../lib/game';
import { placement, rankOf, simulate, type SimResult } from '../lib/receipts';
import { pushRecent } from '../lib/recent';
import { MAX_PAPER, PAPER_KEY, paperPnl, type PaperTrade } from '../lib/paper';
import type { ReceiptDoc } from '../lib/receiptDoc';
import type { TokenReceipts } from '../lib/types';
import { compact, dateTime, day, parseAmount, pct, price, short, span, usd } from '../lib/format';
import { ROUTES, SITE_HOST, SITE_URL } from '../lib/site';
import { saveFile, shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Receipt } from './Receipt';
import { Failure, Loading } from './States';
import { PriceChart, type Marker } from './PriceChart';
import { TokenImage } from './TokenImage';
import { Sheet } from './Sheet';

const BAGS = [50, 100, 500, 1000];
const PLAY_MS = 2_200;

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
  const [playing, setPlaying] = useState(false);
  const [reveal, setReveal] = useState(last);
  const [result, setResult] = useState<{ sim: SimResult; doc: ReceiptDoc; place: number; amount: number } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [shown, setShown] = useState(Infinity);
  const [saving, setSaving] = useState(false);
  const [paper, setPaper] = useStored<PaperTrade[]>(PAPER_KEY, []);
  const ids = { bag: useId(), entry: useId(), exit: useId() };

  const amount = parseAmount(bag);
  const bagOk = Number.isFinite(amount) && amount >= 1 && amount <= 1_000_000;
  const holdNow = exit === last;
  const sim = useMemo(() => simulate({ series, entry, exit, usd: bagOk ? amount : 0, holdNow, nowPrice: token.priceUsd }), [series, entry, exit, amount, bagOk, token, holdNow]);
  const place = placement(sim.pnl, board);

  // the replay walks the held stretch on the chart, then the receipt prints in the sheet
  useEffect(() => {
    if (!playing) return;
    if (reveal < exit) {
      const steps = Math.max(1, exit - entry);
      const jump = Math.max(1, Math.ceil(steps / 50));
      const id = setTimeout(() => setReveal((v) => Math.min(exit, v + jump)), PLAY_MS / Math.ceil(steps / jump));
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the replay ends at the exit
    setPlaying(false);
    setShown(0);
    setSheet(true);
  }, [playing, reveal, exit, entry]);

  useEffect(() => {
    if (!sheet || !result || shown >= result.doc.lines.length) return;
    const id = setTimeout(() => setShown((s) => s + 1), 55);
    return () => clearTimeout(id);
  }, [sheet, result, shown]);

  const placeTrade = () => {
    if (!sim.ok || playing) return;
    const doc = simDoc(r, sim, entry, exit, holdNow, place, amount);
    setResult({ sim, doc, place, amount });
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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReveal(exit);
      setShown(Infinity);
      setSheet(true);
      return;
    }
    setReveal(entry);
    setPlaying(true);
  };

  const closeSheet = useCallback(() => setSheet(false), []);

  const edit =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setReveal(last);
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

  const markers: Marker[] = sim.ok
    ? [
        { ts: series[entry]![0], price: series[entry]![1], kind: 'entry' },
        ...(playing ? [] : [{ ts: series[exit]![0], price: holdNow ? token.priceUsd : series[exit]![1], kind: 'exit' as const }]),
      ]
    : [];
  const live = playing ? (sim.path[Math.max(0, Math.min(sim.path.length - 1, reveal - entry))]?.pnl ?? 0) : sim.pnl;
  const liveTone = toneOf(live);
  const mine = paper.filter((p) => p.chain === token.chain && p.address === token.address);

  const closeAtMarket = (id: string) => setPaper((list) => list.map((p) => (p.id === id ? { ...p, exitTs: Math.floor(Date.now() / 1000), exitPrice: token.priceUsd } : p)));

  const share = async () => {
    if (!result) return;
    const res = await shareLink(
      `${SITE_URL}${ROUTES.token(token.address)}`,
      'Receipts',
      `Paper-traded ${usd(result.amount)} of $${token.symbol}: ${usd(result.sim.pnl, { signed: true })} (${pct(result.sim.roi, { signed: true })}), #${result.place} of ${board.length + 1} traders. Beat it:`,
    );
    if (res === 'copied') toast('Link copied.');
    else if (res === 'failed') toast('Couldn’t share. Copy the address bar instead.');
  };
  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const { receiptPng } = await import('../lib/receiptImage');
      const blob = await receiptPng(result.doc, SITE_HOST);
      const res = await saveFile(new File([blob], `receipt-${token.symbol.toLowerCase().replace(/[^a-z0-9]/g, '') || 'token'}.png`, { type: 'image/png' }));
      if (res === 'saved') toast('Receipt saved.');
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
        <Stat k="Mcap" v={usd(token.mcapUsd)} />
        <Stat k="Liquidity" v={usd(token.liquidityUsd)} />
        <Stat k="Vol 24h" v={usd(token.volume24hUsd)} />
        <Stat k="Age" v={token.createdAt ? span(now - token.createdAt) : '-'} />
        <Stat k="ATH" v={price(r.ath.priceUsd)} />
        <a href={token.url} target="_blank" rel="noreferrer" className="ml-auto flex shrink-0 items-center gap-1 text-muted hover:text-ink">
          DexScreener <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </dl>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* the chart */}
        <section className="panel p-3 sm:p-4" aria-label="Chart">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="eyebrow">{r.candle} candles · log</p>
            {sim.ok && (
              <p className={cx('num rounded-md px-2 py-0.5 text-[13px] font-semibold', liveTone === 'pos' && 'bg-pos-wash text-pos', liveTone === 'neg' && 'bg-neg-wash text-neg', !liveTone && 'bg-subtle')} aria-live="polite">
                {usd(live, { signed: true })}
              </p>
            )}
          </div>
          <PriceChart series={series} markers={markers} range={sim.ok ? [entry, exit] : undefined} reveal={reveal} tone={liveTone} athTs={r.ath.ts} className="mt-3" />
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
            <Row k="Est. P&L" v={sim.ok ? `${usd(sim.pnl, { signed: true })} · ${pct(sim.roi, { signed: true })}` : '-'} tone={sim.ok ? toneOf(sim.pnl) : null} strong />
            <Row k="Rank" v={sim.ok ? `#${place} of ${board.length + 1}` : '-'} />
          </dl>

          <button type="button" onClick={placeTrade} disabled={!sim.ok || playing} className="btn btn-primary mt-4 h-11 w-full text-[14.5px]">
            {playing && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {playing ? 'Replaying…' : 'Place paper trade'}
          </button>
          <p className="mt-2.5 text-[11.5px] leading-snug text-faint">At candle close prices. DEX fees, taxes and slippage not included.</p>
        </section>
      </div>

      {mine.length > 0 && (
        <section className="mt-6" aria-labelledby="positions">
          <h2 id="positions" className="text-[14px] font-semibold">
            My {token.symbol} paper trades
          </h2>
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
                {mine.map((p) => {
                  const pnl = paperPnl(p, token.priceUsd) ?? 0;
                  return (
                    <tr key={p.id}>
                      <Td>{day(p.entryTs)}</Td>
                      <Td>{usd(p.usd)}</Td>
                      <Td wide>{price(p.entryPrice)}</Td>
                      <Td>{p.exitPrice ? price(p.exitPrice) : <span className="text-muted">Open · {price(token.priceUsd)}</span>}</Td>
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
        </section>
      )}

      <Board r={r} />

      <Sheet open={sheet && !!result} onClose={closeSheet} title="Paper trade receipt">
        {result && (
          <>
            <Receipt doc={result.doc} shown={shown} />
            <p className="mt-5 text-center text-[13.5px] text-ink-2">
              You’d place <b className="num">#{result.place}</b> of <b className="num">{board.length + 1}</b> recent {token.symbol} traders.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={save} disabled={saving} className="btn btn-quiet">
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                Save image
              </button>
              <button type="button" onClick={share} className="btn btn-primary">
                <Link2 className="size-4" aria-hidden /> Challenge
              </button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <dt className="text-muted">{k}</dt>
      <dd className="num font-medium">{v}</dd>
    </div>
  );
}

function Row({ k, v, tone, strong }: { k: string; v: string; tone?: 'pos' | 'neg' | null; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={cx('num text-right', strong && 'font-semibold', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{v}</dd>
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

function Board({ r }: { r: TokenReceipts }) {
  const [side, setSide] = useState<'top' | 'worst'>('top');
  const rows = side === 'top' ? r.board.slice(0, 10) : [...r.board].reverse().slice(0, 10);
  return (
    <section className="mt-8" aria-labelledby="board-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="board-title" className="text-[14px] font-semibold">
            Recent traders
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {r.board.length} wallets in the latest {r.window.trades} trades ({span(r.window.to - r.window.from)}). Tap one to call its receipt.
          </p>
        </div>
        <div role="tablist" aria-label="Order" className="flex rounded-lg bg-subtle p-0.5">
          {(['top', 'worst'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => setSide(s)}
              className={cx('h-8 rounded-md px-3 text-[12.5px] font-medium', side === s ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
            >
              {s === 'top' ? 'Top P&L' : 'Worst P&L'}
            </button>
          ))}
        </div>
      </div>
      {r.board.length === 0 ? (
        <p className="panel mt-2 px-4 py-6 text-[13px] text-muted">No recent trades in the feed.</p>
      ) : (
        <div className="panel mt-2 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <Th>#</Th>
                <Th>Wallet</Th>
                <Th right wide>
                  Trades
                </Th>
                <Th right>Bought</Th>
                <Th right>P&L</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.trader} className="transition-colors hover:bg-hover">
                  <Td>
                    <span className="text-muted">{r.board.indexOf(row) + 1}</span>
                  </Td>
                  <Td>
                    <Link href={ROUTES.trader(row.trader, r.token.address)} className="font-medium underline-offset-2 hover:underline">
                      {short(row.trader)}
                    </Link>
                  </Td>
                  <Td right wide>
                    {row.trades}
                  </Td>
                  <Td right>{usd(row.usdIn)}</Td>
                  <Td right>
                    <span className={cx('font-medium', row.pnl > 0 ? 'text-pos' : row.pnl < 0 && 'text-neg')}>{usd(row.pnl, { signed: true })}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function simDoc(r: TokenReceipts, s: SimResult, entry: number, exit: number, holdNow: boolean, place: number, bag: number): ReceiptDoc {
  const { token, series } = r;
  const rank = RANKS[rankOf(s.roi)];
  const now = Date.now() / 1000;
  const held = (holdNow ? now : series[exit]![0]) - series[entry]![0];
  return {
    lines: [
      { t: 'title', text: 'RECEIPTS' },
      { t: 'center', text: `PAPER TRADE · $${token.symbol}`, muted: true },
      { t: 'center', text: `${token.chainName.toUpperCase()} · ${dateTime(now)}`, muted: true },
      { t: 'dash' },
      { t: 'row', left: 'BUY', right: usd(bag) },
      { t: 'row', left: '  ON', right: day(series[entry]![0]), muted: true },
      { t: 'row', left: '  AT', right: price(s.entryPrice), muted: true },
      { t: 'row', left: 'TOKENS', right: compact(s.tokens) },
      { t: 'row', left: holdNow ? 'HELD TO' : 'SELL', right: holdNow ? 'NOW' : day(series[exit]![0]) },
      { t: 'row', left: '  AT', right: price(s.exitPrice), muted: true },
      { t: 'row', left: 'HELD FOR', right: span(held) },
      { t: 'dash' },
      { t: 'row', left: holdNow ? 'WORTH NOW' : 'SOLD FOR', right: usd(s.out) },
      { t: 'row', left: 'BEST EXIT', right: `${usd(s.bestOut)} · ${day(s.bestTs)}`, muted: true },
      { t: 'dash' },
      { t: 'total', left: 'P&L', right: usd(s.pnl, { signed: true }), sub: pct(s.roi, { signed: true }), tone: toneOf(s.pnl) },
      { t: 'row', left: 'VS RECENT TRADERS', right: `#${place} of ${r.board.length + 1}` },
      { t: 'rank', name: rank.name, line: rank.line },
      { t: 'barcode', seed: `${token.address}:${entry}:${exit}` },
      { t: 'center', text: SITE_HOST, muted: true },
      { t: 'center', text: 'paper money · not financial advice', muted: true },
    ],
    stamp: stampOf(s.pnl),
  };
}
