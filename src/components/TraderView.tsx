'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, ChevronDown, Dices, Download, Flame, Link2, Loader2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStored } from '../hooks/useStored';
import { KEYS, NO_STREAK, RANKS, stampOf, toneOf, type Recent, type Streak } from '../lib/game';
import { rankOf } from '../lib/receipts';
import { pushRecent } from '../lib/recent';
import type { Line, ReceiptDoc } from '../lib/receiptDoc';
import type { IsToken, Position, TraderReceipts } from '../lib/types';
import { dateTime, day, pct, short, sol, tinyPrice, usd } from '../lib/format';
import { ROUTES, SITE_HOST, SITE_URL, solscanAccount, solscanTx } from '../lib/site';
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

export function TraderView({ address }: { address: string }) {
  const router = useRouter();
  const { state, reload } = useApi<TraderReceipts | IsToken>(`/api/trader/${address}/`);
  const [, setRecent] = useStored<Recent[]>(KEYS.recent, []);

  const data = state.status === 'ready' ? state.data : null;
  // a CA pasted in the trader box goes to the token game
  useEffect(() => {
    if (data?.kind === 'is-token') router.replace(ROUTES.token(data.mint));
    else if (data?.kind === 'trader') setRecent((r) => pushRecent(r, { kind: 'trader', address, label: short(address) }));
  }, [data, address, router, setRecent]);

  if (state.status === 'loading' || data?.kind === 'is-token')
    return <Printing what={data?.kind === 'is-token' ? 'That’s a token CA — opening the token game.' : `Reading every Bordrless trade from ${short(address)}`} />;
  if (state.status === 'error') return <Failure error={state.error} onRetry={reload} />;
  return <TraderGame key={address} r={data as TraderReceipts} />;
}

function TraderGame({ r }: { r: TraderReceipts }) {
  const router = useRouter();
  const [call, setCall] = useState<Call | null>(null);
  const [shown, setShown] = useState(0);
  const [streak, setStreak] = useStored<Streak>(KEYS.streak, NO_STREAK);
  const [nexting, setNexting] = useState(false);
  const [saving, setSaving] = useState(false);
  const scored = useRef(false);
  const paperRef = useRef<HTMLDivElement>(null);

  const doc = useMemo(() => traderDoc(r), [r]);
  const t = r.totals;
  const won = t.pnl > 0;
  const total = doc.lines.length;
  const done = call !== null && shown >= total;
  const right = call === 'profit' ? won : call === 'rekt' ? !won : null;

  // print a line at a time once the call is in
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
      const body = (await res.json()) as { address?: string };
      if (!body.address) throw new Error('none');
      router.push(ROUTES.trader(body.address));
    } catch {
      setNexting(false);
      toast('Couldn’t find another trader right now.');
    }
  };

  const share = async () => {
    const rank = RANKS[rankOf(t.roi)].name;
    const res = await shareLink(`${SITE_URL}${ROUTES.trader(r.owner)}`, 'Receipts', `Pulled the receipts on ${short(r.owner)}: ${sol(t.pnl, { signed: true })} on Bordrless. Rank: ${rank}.`);
    if (res === 'copied') toast('Link copied.');
    else if (res === 'failed') toast('Couldn’t share. Copy the address bar instead.');
  };

  const save = async () => {
    setSaving(true);
    try {
      const { receiptPng } = await import('../lib/receiptImage');
      const blob = await receiptPng(doc, SITE_HOST);
      const res = await saveFile(new File([blob], `receipt-${r.owner.slice(0, 6)}.png`, { type: 'image/png' }));
      if (res === 'saved') toast('Receipt saved.');
    } catch {
      toast('Couldn’t make the image. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label text-muted">Trader receipts</p>
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
          <a href={solscanAccount(r.owner)} target="_blank" rel="noreferrer" className="btn btn-ghost h-9 min-h-0 px-3 text-sm">
            Solscan <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10">
        {/* the call, then the verdict */}
        <section className="space-y-4 lg:sticky lg:top-24" aria-label="Your call">
          {call === null ? (
            <div className="card p-5 sm:p-6">
              <p className="label text-muted">Before it prints</p>
              <h2 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">Profit or rekt?</h2>
              <p className="mt-2 text-ink-2">Here’s how much this wallet played. You don’t get to see how it went until you call it.</p>
              <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Clue label="Tokens" value={String(r.positions.length)} />
                <Clue label="Trades" value={String(t.trades)} />
                <Clue label="SOL in" value={sol(t.solIn).replace(' SOL', '')} />
                <Clue label="Since" value={day(t.firstTs).split(',')[0]!} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {r.positions.slice(0, 8).map((p) => (
                  <span key={p.token.mint} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 pl-1 pr-2.5 text-sm font-semibold">
                    <TokenImage src={p.token.image} symbol={p.token.symbol} className="size-5 text-[10px]" />${p.token.symbol}
                  </span>
                ))}
                {r.positions.length > 8 && <span className="px-1 py-1 text-sm text-muted">+{r.positions.length - 8}</span>}
              </div>
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
                    {won ? 'In profit' : t.pnl < 0 ? 'Down' : 'Flat'} by <span className={cx('num font-semibold', won ? 'text-pos' : t.pnl < 0 && 'text-neg')}>{sol(t.pnl, { signed: true })}</span> ({usd(t.pnl * r.solUsd, { signed: true })}).
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
                  </div>
                  <Link href="/#paste" className="mt-3 block text-center text-sm font-medium text-muted underline underline-offset-2 hover:text-ink">
                    Paste another address
                  </Link>
                </div>
              )}
            </div>
          )}
          {!r.complete && <p className="text-[13px] text-muted">Some history was too long to read in full, so the oldest trades may be missing.</p>}
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

      {done && (
        <section className="mt-10" aria-labelledby="by-token">
          <h2 id="by-token" className="text-xl font-bold tracking-tight sm:text-2xl">
            Token by token
          </h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {r.positions.map((p) => (
              <PositionCard key={p.token.mint} p={p} solUsd={r.solUsd} />
            ))}
          </ul>
        </section>
      )}
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

function PositionCard({ p, solUsd }: { p: Position; solUsd: number }) {
  const [open, setOpen] = useState(false);
  const tone = toneOf(p.pnl);
  const markers = p.trades.map(([ts, side, , , price]) => ({ ts, price, kind: side }));
  return (
    <li className="card overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <TokenImage src={p.token.image} symbol={p.token.symbol} className="size-10 text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">${p.token.symbol}</p>
          <p className="truncate text-[13px] text-muted">{p.token.name}</p>
        </div>
        <div className="text-right">
          <p className={cx('num font-bold', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>{sol(p.pnl, { signed: true })}</p>
          <p className="num text-[13px] text-muted">{pct(p.roi, { signed: true })}</p>
        </div>
      </div>
      <div className="px-4">
        <PriceChart series={p.series} markers={markers.length <= 60 ? markers : []} className="rounded-lg" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-4 text-sm sm:grid-cols-3">
        <Kv k="SOL in" v={sol(p.solIn)} />
        <Kv k="SOL out" v={sol(p.solOut)} />
        <Kv k="Bag now" v={sol(p.holdValue)} />
        <Kv k="Rewards" v={sol(p.rewards)} />
        <Kv k="Trades" v={`${p.buys}B / ${p.sells}S`} />
        <Kv k="Left on table" v={p.missedSol > 0 ? sol(p.missedSol) : '—'} tone={p.missedSol > 0 ? 'neg' : null} />
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn btn-ghost h-9 min-h-0 px-3 text-sm">
          Trades <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        <Link href={ROUTES.token(p.token.mint)} className="btn btn-ghost h-9 min-h-0 px-3 text-sm">
          Ape this token
        </Link>
        <span className="num ml-auto text-[12px] text-muted">{usd(p.pnl * solUsd, { signed: true })}</span>
      </div>
      {open && (
        <ol className="max-h-72 overflow-y-auto border-t border-line text-[13px]">
          {[...p.trades].reverse().map(([ts, side, tokens, s, price, sig]) => (
            <li key={sig} className="flex items-center gap-3 border-b border-line/60 px-4 py-2 last:border-0">
              <span className={cx('num w-9 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-bold text-white', side === 'buy' ? 'bg-pos' : 'bg-neg')}>{side === 'buy' ? 'BUY' : 'SELL'}</span>
              <span className="num min-w-0 flex-1 truncate">
                {sol(s)} <span className="text-muted">@ {tinyPrice(price)}</span>
                <span className="block text-[11.5px] text-muted">
                  {Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(tokens)} ${p.token.symbol} · {dateTime(ts)}
                </span>
              </span>
              <a href={solscanTx(sig)} target="_blank" rel="noreferrer" className="shrink-0 text-muted hover:text-ink" aria-label="Open the transaction on Solscan">
                <ArrowUpRight className="size-4" />
              </a>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: 'pos' | 'neg' | null }) {
  return (
    <div className="min-w-0">
      <dt className="label text-muted">{k}</dt>
      <dd className={cx('num truncate font-semibold', tone === 'neg' && 'text-neg')}>{v}</dd>
    </div>
  );
}

/** The trader's receipt, line by line. */
function traderDoc(r: TraderReceipts): ReceiptDoc {
  const t = r.totals;
  const rank = RANKS[rankOf(t.roi)];
  const decided = t.wins + t.losses;
  const items: Line[] = r.positions.slice(0, MAX_ITEMS).map((p) => ({
    t: 'item',
    name: `$${p.token.symbol}`,
    sub: `in ${num3(p.solIn)} · out ${num3(p.solOut)} · bag ${num3(p.holdValue)}${p.rewards > 0 ? ` · rwd ${num3(p.rewards)}` : ''}`,
    right: sol(p.pnl, { signed: true }).replace(' SOL', ''),
    tone: toneOf(p.pnl),
  }));
  const rest = r.positions.slice(MAX_ITEMS);
  if (rest.length) {
    const pnl = rest.reduce((a, p) => a + p.pnl, 0);
    items.push({ t: 'row', left: `+${rest.length} more tokens`, right: sol(pnl, { signed: true }).replace(' SOL', ''), tone: toneOf(pnl), muted: true });
  }
  return {
    lines: [
      { t: 'title', text: 'RECEIPTS' },
      { t: 'center', text: 'TRADER RECEIPT · BORDRLESS', muted: true },
      { t: 'center', text: dateTime(Date.now() / 1000), muted: true },
      { t: 'dash' },
      { t: 'row', left: 'WALLET', right: short(r.owner) },
      { t: 'row', left: 'FIRST TRADE', right: day(t.firstTs) },
      { t: 'row', left: 'TRADES', right: `${t.trades} on ${r.positions.length} token${r.positions.length === 1 ? '' : 's'}` },
      { t: 'dash' },
      { t: 'row', left: 'ITEM', right: 'P&L SOL', muted: true },
      ...items,
      { t: 'dash' },
      { t: 'row', left: 'SOL IN', right: sol(t.solIn) },
      { t: 'row', left: 'SOL OUT', right: sol(t.solOut) },
      { t: 'row', left: 'BAG AT TODAY’S PRICE', right: sol(t.holdValue) },
      ...(t.rewards > 0 ? [{ t: 'row', left: 'HOLDER REWARDS', right: sol(t.rewards, { signed: true }), tone: 'pos' } as Line] : []),
      { t: 'row', left: 'WIN RATE', right: decided ? `${t.wins}/${decided} · ${pct(t.wins / decided)}` : '—' },
      ...(t.missedSol > 0 ? [{ t: 'row', left: 'SOLD BEFORE THE TOP', right: `-${sol(t.missedSol)}`, tone: 'neg' } as Line] : []),
      { t: 'dash' },
      { t: 'total', left: 'TOTAL P&L', right: sol(t.pnl, { signed: true }), sub: `${usd(t.pnl * r.solUsd, { signed: true })} · ${pct(t.roi, { signed: true })}`, tone: toneOf(t.pnl) },
      { t: 'rank', name: rank.name, line: rank.line },
      { t: 'barcode', seed: r.owner },
      { t: 'center', text: SITE_HOST, muted: true },
      { t: 'center', text: 'a game · not financial advice', muted: true },
    ],
    stamp: stampOf(t.pnl),
  };
}

const num3 = (n: number) => sol(n).replace(' SOL', '');
