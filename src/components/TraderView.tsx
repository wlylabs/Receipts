'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, Coins, Dices, Download, Flame, Link2, Loader2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { KEYS, NO_STREAK, RANKS, stampOf, toneOf, type Recent, type Streak } from '../lib/game';
import { rankOf } from '../lib/receipts';
import { pushRecent } from '../lib/recent';
import { CHAINS } from '../lib/chains';
import type { Line, ReceiptDoc } from '../lib/receiptDoc';
import type { TraderReceipts } from '../lib/types';
import { compact, dateTime, day, pct, price, short, span, usd } from '../lib/format';
import { ROUTES, SITE_HOST, SITE_URL } from '../lib/site';
import { saveFile, shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Receipt } from './Receipt';
import { Failure, Printing } from './States';
import { PriceChart } from './PriceChart';
import { TokenImage } from './TokenImage';

type Call = 'profit' | 'rekt' | 'skip';
const LINE_MS = 95;
const MAX_ITEMS = 10;

export function TraderView({ address, ca }: { address: string; ca: string }) {
  const { state, reload } = useApi<TraderReceipts>(ca ? `/api/trader/${address}/?ca=${encodeURIComponent(ca)}` : null);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => {
    if (data) setRecent((r) => pushRecent(r, { kind: 'trader', address, ca: data.token.address, label: `${short(address)} · $${data.token.symbol}` }));
  }, [data, address, setRecent]);

  if (!ca) return <Failure error={{ code: 'invalid', error: 'Paste the token this wallet traded, too.' }} onRetry={reload} />;
  if (state.status === 'loading') return <Printing what={`Finding ${short(address)} in the token’s latest trades`} />;
  if (state.status === 'error') return <Failure error={state.error} onRetry={reload} />;
  return <TraderGame key={`${address}:${ca}`} r={state.data} />;
}

function TraderGame({ r }: { r: TraderReceipts }) {
  const router = useRouter();
  const [now] = useState(() => Date.now() / 1000);
  const [call, setCall] = useState<Call | null>(null);
  const [shown, setShown] = useState(0);
  const [streak, setStreak] = useStored<Streak>(KEYS.streak, NO_STREAK);
  const [nexting, setNexting] = useState(false);
  const [saving, setSaving] = useState(false);
  const scored = useRef(false);
  const paperRef = useRef<HTMLDivElement>(null);

  const doc = useMemo(() => traderDoc(r), [r]);
  const p = r.position;
  const { token } = r;
  const chain = CHAINS[token.chain];
  const won = p.pnl > 0;
  const total = doc.lines.length;
  const done = call !== null && shown >= total;
  const right = call === 'profit' ? won : call === 'rekt' ? !won : null;

  useEffect(() => {
    if (call === null || shown >= total) return;
    const id = setTimeout(() => setShown((s) => s + 1), LINE_MS);
    return () => clearTimeout(id);
  }, [call, shown, total]);

  // score the call once the receipt has printed
  useEffect(() => {
    if (!done || right === null || scored.current) return;
    scored.current = true;
    setStreak((s) => {
      const current = right ? s.current + 1 : 0;
      return { current, best: Math.max(s.best, current), calls: s.calls + 1, right: s.right + (right ? 1 : 0) };
    });
  }, [done, right, setStreak]);

  const make = (c: Call) => {
    setCall(c);
    setShown(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? total : 0);
    requestAnimationFrame(() => paperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const next = async () => {
    setNexting(true);
    try {
      const res = await fetch('/api/random', { cache: 'no-store' });
      const body = (await res.json()) as { address?: string; ca?: string };
      if (!body.address || !body.ca) throw new Error('none');
      router.push(ROUTES.trader(body.address, body.ca));
    } catch {
      setNexting(false);
      toast('Couldn’t find another trader right now.');
    }
  };

  const share = async () => {
    const rank = RANKS[rankOf(p.roi)].name;
    const res = await shareLink(`${SITE_URL}${ROUTES.trader(r.owner, token.address)}`, 'Receipts', `Pulled the receipts on ${short(r.owner)} in $${token.symbol}: ${usd(p.pnl, { signed: true })}. Rank: ${rank}.`);
    if (res === 'copied') toast('Link copied.');
    else if (res === 'failed') toast('Couldn’t share. Copy the address bar instead.');
  };

  const save = async () => {
    setSaving(true);
    try {
      const { receiptPng } = await import('../lib/receiptImage');
      const blob = await receiptPng(doc, SITE_HOST);
      const res = await saveFile(new File([blob], `receipt-${r.owner.slice(0, 6)}-${slug(token.symbol)}.png`, { type: 'image/png' }));
      if (res === 'saved') toast('Receipt saved.');
    } catch {
      toast('Couldn’t make the image. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const markers = r.trades.map(([ts, side, , , pr]) => ({ ts, price: pr, kind: side }));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label text-muted">Trader receipts · {token.chainName}</p>
          <h1 className="num mt-1 truncate text-2xl font-bold sm:text-3xl" title={r.owner}>
            {short(r.owner)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {streak.calls > 0 && (
            <span className="label inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-ink">
              <Flame className="size-3.5 text-[#e8590c]" aria-hidden /> Streak {streak.current}
            </span>
          )}
          {chain && (
            <a href={chain.account(r.owner)} target="_blank" rel="noreferrer" className="btn btn-ghost h-9 min-h-0 px-3 text-sm">
              Explorer <ArrowUpRight className="size-4" aria-hidden />
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10">
        <section className="space-y-4" aria-label="Your call">
          {call === null ? (
            <div className="card p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <TokenImage src={token.image} symbol={token.symbol} className="size-10 text-base" />
                <div className="min-w-0">
                  <p className="truncate font-bold">${token.symbol}</p>
                  <p className="truncate text-[13px] text-muted">
                    {token.name} · {token.chainName}
                  </p>
                </div>
              </div>
              <h2 className="mt-5 text-2xl font-bold leading-tight sm:text-3xl">Profit or rekt?</h2>
              <p className="mt-2 text-ink-2">Here’s how this wallet played ${token.symbol}. You don’t get to see how it went until you call it.</p>
              <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Clue label="Buys" value={String(p.buys)} />
                <Clue label="Sells" value={String(p.sells)} />
                <Clue label="Put in" value={usd(p.usdIn)} />
                <Clue label="First trade" value={`${span(now - p.firstTs)} ago`} />
              </dl>
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => make('profit')} className="btn h-16 bg-pos text-lg text-white">
                  <ThumbsUp className="size-5" aria-hidden /> Profit
                </button>
                <button type="button" onClick={() => make('rekt')} className="btn h-16 bg-neg text-lg text-white">
                  <ThumbsDown className="size-5" aria-hidden /> Rekt
                </button>
              </div>
              <button type="button" onClick={() => make('skip')} className="mt-3 w-full py-2 text-sm font-medium text-muted underline underline-offset-2 hover:text-ink">
                Skip the call, just print it
              </button>
            </div>
          ) : (
            <div className={cx('card p-5 sm:p-6', done && right === true && 'ring-2 ring-pos', done && right === false && 'ring-2 ring-neg')}>
              {!done ? (
                <p className="flex items-center gap-2 text-lg font-semibold" role="status">
                  <Loader2 className="size-5 animate-spin" aria-hidden /> Printing…
                </p>
              ) : (
                <div className="pop" role="status">
                  {right === null ? (
                    <p className="text-2xl font-bold">Printed.</p>
                  ) : right ? (
                    <p className="flex items-center gap-2 text-2xl font-bold text-pos">
                      <Check className="size-7" aria-hidden /> Called it.
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-2xl font-bold text-neg">
                      <X className="size-7" aria-hidden /> Wrong call.
                    </p>
                  )}
                  <p className="mt-1 text-ink-2">
                    {won ? 'Up' : p.pnl < 0 ? 'Down' : 'Flat'} <span className={cx('num font-semibold', won ? 'text-pos' : p.pnl < 0 && 'text-neg')}>{usd(p.pnl, { signed: true })}</span> on ${token.symbol}, #
                    {r.place} of {r.of} recent traders.
                    {right !== null && (
                      <>
                        {' '}
                        Streak <b className="num">{streak.current}</b>, best <b className="num">{streak.best}</b>.
                      </>
                    )}
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button type="button" onClick={next} disabled={nexting} className="btn btn-hi col-span-2 h-13 text-base">
                      {nexting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Dices className="size-5" aria-hidden />}
                      Next random trader
                    </button>
                    <button type="button" onClick={save} disabled={saving} className="btn btn-ghost">
                      {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                      Save image
                    </button>
                    <button type="button" onClick={share} className="btn btn-ghost">
                      <Link2 className="size-4" aria-hidden /> Share link
                    </button>
                    <Link href={ROUTES.token(token.address)} className="btn btn-ghost col-span-2">
                      <Coins className="size-4" aria-hidden /> Ape ${token.symbol} yourself
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="card p-4 sm:p-5">
              <p className="label text-muted">
                ${token.symbol} · {r.candle} candles · B buy, S sell
              </p>
              <PriceChart series={r.series} markers={markers.length <= 80 ? markers : []} className="mt-3" />
              <ol className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-line text-[13px]">
                {[...r.trades].reverse().map(([ts, side, tokens, u, pr, tx]) => (
                  <li key={tx + side + ts} className="flex items-center gap-3 border-b border-line/60 px-3 py-2 last:border-0">
                    <span className={cx('num w-10 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-bold text-white', side === 'buy' ? 'bg-pos' : 'bg-neg')}>{side === 'buy' ? 'BUY' : 'SELL'}</span>
                    <span className="num min-w-0 flex-1 truncate">
                      {usd(u)} <span className="text-muted">@ {price(pr)}</span>
                      <span className="block text-[11.5px] text-muted">
                        {compact(tokens)} ${token.symbol} · {dateTime(ts)}
                      </span>
                    </span>
                    {chain && (
                      <a href={chain.tx(tx)} target="_blank" rel="noreferrer" className="shrink-0 text-muted hover:text-ink" aria-label="Open the transaction in the explorer">
                        <ArrowUpRight className="size-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="text-[13px] leading-snug text-muted">
            Read from ${token.symbol}’s latest {r.window.trades} trades on {token.dex} ({span(r.window.to - r.window.from)} of trading). Earlier trades by this wallet are not in the feed.
          </p>
        </section>

        <div ref={paperRef} className="scroll-mt-20 pb-4 pt-3">
          {call === null ? (
            <div className="paper mx-auto grid w-full max-w-[400px] place-items-center px-6 py-16 text-center">
              <div>
                <p className="text-xl font-extrabold tracking-[0.18em]">RECEIPTS</p>
                <p className="mt-2 text-[13px] text-[#6e6a60]">Make your call to print.</p>
                <p className="mt-6 text-5xl font-extrabold text-[#d9d3c4]">???</p>
              </div>
            </div>
          ) : (
            <Receipt doc={doc} shown={shown} />
          )}
        </div>
      </div>
    </div>
  );
}

function Clue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <dt className="label text-muted">{label}</dt>
      <dd className="num mt-0.5 truncate text-lg font-bold">{value}</dd>
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'token';

/** The trader's receipt, line by line. */
function traderDoc(r: TraderReceipts): ReceiptDoc {
  const p = r.position;
  const { token } = r;
  const rank = RANKS[rankOf(p.roi)];
  const items: Line[] = r.trades.slice(-MAX_ITEMS).map(([ts, side, tokens, u, pr]) => ({
    t: 'item',
    name: `${side === 'buy' ? 'BUY ' : 'SELL'} ${compact(tokens)}`,
    sub: `@ ${price(pr)} · ${day(ts)}`,
    right: side === 'buy' ? `-${usd(u)}` : `+${usd(u)}`,
    tone: side === 'buy' ? null : 'pos',
  }));
  const earlier = r.trades.length - MAX_ITEMS;
  return {
    lines: [
      { t: 'title', text: 'RECEIPTS' },
      { t: 'center', text: `TRADER RECEIPT · ${token.chainName.toUpperCase()}`, muted: true },
      { t: 'center', text: dateTime(Date.now() / 1000), muted: true },
      { t: 'dash' },
      { t: 'row', left: 'WALLET', right: short(r.owner) },
      { t: 'row', left: 'TOKEN', right: `$${token.symbol}` },
      { t: 'row', left: 'TRADES', right: `${p.buys} buys · ${p.sells} sells` },
      { t: 'dash' },
      ...(earlier > 0 ? [{ t: 'row', left: `${earlier} earlier trades`, right: '…', muted: true } as Line] : []),
      ...items,
      { t: 'dash' },
      { t: 'row', left: 'PUT IN', right: usd(p.usdIn) },
      { t: 'row', left: 'TOOK OUT', right: usd(p.usdOut) },
      { t: 'row', left: 'BAG AT TODAY’S PRICE', right: usd(p.openValue) },
      { t: 'row', left: 'REALIZED', right: usd(p.realized, { signed: true }), tone: toneOf(p.realized) },
      { t: 'row', left: 'UNREALIZED', right: usd(p.unrealized, { signed: true }), tone: toneOf(p.unrealized) },
      ...(p.missedUsd > 0.005 ? [{ t: 'row', left: 'SOLD BEFORE THE TOP', right: `-${usd(p.missedUsd)}`, tone: 'neg' } as Line] : []),
      ...(p.unknownSold > 0 ? [{ t: 'row', left: 'SOLD, BOUGHT EARLIER', right: `${compact(p.unknownSold)} (no cost)`, muted: true } as Line] : []),
      { t: 'dash' },
      { t: 'total', left: 'P&L', right: usd(p.pnl, { signed: true }), sub: pct(p.roi, { signed: true }), tone: toneOf(p.pnl) },
      { t: 'row', left: 'VS RECENT TRADERS', right: `#${r.place} of ${r.of}` },
      { t: 'rank', name: rank.name, line: rank.line },
      { t: 'barcode', seed: `${r.owner}:${token.address}` },
      { t: 'center', text: SITE_HOST, muted: true },
      { t: 'center', text: 'a game · not financial advice', muted: true },
    ],
    stamp: stampOf(p.pnl),
  };
}
