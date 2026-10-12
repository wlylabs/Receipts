'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, Dices, Download, Flame, LineChart, Link2, Loader2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
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
import { Failure, Loading } from './States';
import { Holdings } from './Holdings';
import { PriceChart } from './PriceChart';
import { TokenImage } from './TokenImage';

type Call = 'profit' | 'rekt' | 'skip';
const LINE_MS = 80;
const MAX_ITEMS = 10;

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
    if (!window.matchMedia('(min-width: 64rem)').matches) requestAnimationFrame(() => paperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
    <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">
            Wallet · {token.chainName}
          </p>
          <h1 className="num truncate text-[20px] font-semibold tracking-tight" title={r.owner}>
            {short(r.owner)}
          </h1>
        </div>
        {streak.calls > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-subtle px-2.5 py-1.5 text-[12.5px] font-medium">
            <Flame className="size-3.5 text-orange-500" aria-hidden /> Streak {streak.current}
          </span>
        )}
        <Link href={ROUTES.wallet(r.owner)} className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
          Other tokens
        </Link>
        {chain && (
          <a href={chain.account(r.owner)} target="_blank" rel="noreferrer" className="btn btn-quiet h-9 min-h-0 px-3 text-[13px]">
            Explorer <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        )}
      </header>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        <section className="space-y-4" aria-label="Your call">
          {call === null ? (
            <div className="panel p-4 sm:p-5">
              <Link href={ROUTES.token(token.address)} className="flex items-center gap-3">
                <TokenImage src={token.image} symbol={token.symbol} className="size-9 text-sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{token.symbol}</span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {token.name} · {price(token.priceUsd)}
                  </span>
                </span>
              </Link>
              <h2 className="mt-5 text-[22px] font-semibold tracking-tight sm:text-[26px]">Profit or rekt?</h2>
              <p className="mt-1 text-[14px] text-muted">You see how they played {token.symbol}. Not how it went — call it first.</p>
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
                <Clue label="Buys" value={String(p.buys)} />
                <Clue label="Sells" value={String(p.sells)} />
                <Clue label="Put in" value={usd(p.usdIn)} />
                <Clue label="First trade" value={`${span(now - p.firstTs)} ago`} />
              </dl>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => make('profit')} className="btn btn-buy h-12 text-[15px]">
                  <ThumbsUp className="size-4" aria-hidden /> Profit
                </button>
                <button type="button" onClick={() => make('rekt')} className="btn btn-sell h-12 text-[15px]">
                  <ThumbsDown className="size-4" aria-hidden /> Rekt
                </button>
              </div>
              <button type="button" onClick={() => make('skip')} className="mt-2 w-full py-2 text-[13px] text-muted hover:text-ink">
                Skip the call, just print it
              </button>
            </div>
          ) : (
            <div className={cx('panel p-4 sm:p-5', done && right === true && 'border-pos', done && right === false && 'border-neg')}>
              {!done ? (
                <p className="flex items-center gap-2 text-[15px] font-medium" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Printing…
                </p>
              ) : (
                <div className="rise" role="status">
                  {right === null ? (
                    <p className="text-[20px] font-semibold">Printed.</p>
                  ) : right ? (
                    <p className="flex items-center gap-2 text-[20px] font-semibold text-pos">
                      <Check className="size-5" aria-hidden /> Called it.
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-[20px] font-semibold text-neg">
                      <X className="size-5" aria-hidden /> Wrong call.
                    </p>
                  )}
                  <p className="mt-1 text-[14px] text-ink-2">
                    {won ? 'Up' : p.pnl < 0 ? 'Down' : 'Flat'} <span className={cx('num font-semibold', won ? 'text-pos' : p.pnl < 0 && 'text-neg')}>{usd(p.pnl, { signed: true })}</span> on {token.symbol}
                    {r.of > 1 && <> · #{r.place} of {r.of} recent traders</>}.
                    {right !== null && (
                      <>
                        {' '}
                        Streak <b className="num">{streak.current}</b>, best <b className="num">{streak.best}</b>.
                      </>
                    )}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={next} disabled={nexting} className="btn btn-primary col-span-2 h-11">
                      {nexting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Dices className="size-4" aria-hidden />}
                      Next random trader
                    </button>
                    <button type="button" onClick={save} disabled={saving} className="btn btn-quiet">
                      {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                      Save image
                    </button>
                    <button type="button" onClick={share} className="btn btn-quiet">
                      <Link2 className="size-4" aria-hidden /> Share
                    </button>
                    <Link href={ROUTES.token(token.address)} className="btn btn-quiet col-span-2">
                      <LineChart className="size-4" aria-hidden /> Paper-trade {token.symbol} yourself
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {done && (
            <div className="panel p-3 sm:p-4">
              <p className="eyebrow px-1">
                {token.symbol} · {r.candle} candles · B buy, S sell
              </p>
              <PriceChart series={r.series} markers={markers.length <= 80 ? markers : []} className="mt-3" />
              <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-line">
                <table className="w-full min-w-[440px] text-[13px]">
                  <thead className="sticky top-0 bg-surface text-left text-muted">
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 text-[12px] font-medium">Side</th>
                      <th className="px-3 py-2 text-[12px] font-medium">Time</th>
                      <th className="px-3 py-2 text-right text-[12px] font-medium">Tokens</th>
                      <th className="px-3 py-2 text-right text-[12px] font-medium">Value</th>
                      <th className="px-3 py-2">
                        <span className="sr-only">Transaction</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...r.trades].reverse().map(([ts, side, tokens, u, , tx], i) => (
                      <tr key={`${tx}:${i}`}>
                        <td className={cx('px-3 py-2 font-medium', side === 'buy' ? 'text-pos' : 'text-neg')}>{side === 'buy' ? 'Buy' : 'Sell'}</td>
                        <td className="num whitespace-nowrap px-3 py-2 text-muted">{dateTime(ts)}</td>
                        <td className="num px-3 py-2 text-right">{compact(tokens)}</td>
                        <td className="num px-3 py-2 text-right">{usd(u)}</td>
                        <td className="px-3 py-2 text-right">
                          {chain && (
                            <a href={chain.tx(tx)} target="_blank" rel="noreferrer" className="text-faint hover:text-ink" aria-label="Open the transaction in the explorer">
                              <ArrowUpRight className="inline size-3.5" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-[12.5px] leading-relaxed text-muted">
            {r.source === 'chain'
              ? `Read from the chain: every ${token.symbol} transfer in or out of this wallet${r.complete ? '' : ' (latest ones only)'}, priced at the candle of its time. Tokens received as gifts count as buys.`
              : `Read from ${token.symbol}’s latest ${r.window.trades} DEX trades (${span(r.window.to - r.window.from)}). Earlier trades by this wallet are not in that feed.`}
          </p>
        </section>

        <div ref={paperRef} className="scroll-mt-20 lg:sticky lg:top-20">
          {call === null ? (
            <div className="paper mx-auto grid w-full max-w-[380px] place-items-center px-6 py-16 text-center">
              <div>
                <p className="text-lg font-bold tracking-[0.22em]">RECEIPTS</p>
                <p className="mt-2 text-[12.5px] text-[#71717a]">Make your call to print.</p>
                <p className="mt-6 text-4xl font-bold text-[#d4d4d8]">? ? ?</p>
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
    <div className="bg-surface px-3 py-2.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="num mt-0.5 truncate text-[16px] font-semibold">{value}</dd>
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
      { t: 'center', text: `WALLET RECEIPT · ${token.chainName.toUpperCase()}`, muted: true },
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
      { t: 'row', left: 'BAG NOW', right: usd(p.openValue) },
      { t: 'row', left: 'REALIZED', right: usd(p.realized, { signed: true }), tone: toneOf(p.realized) },
      { t: 'row', left: 'UNREALIZED', right: usd(p.unrealized, { signed: true }), tone: toneOf(p.unrealized) },
      ...(p.missedUsd > 0.005 ? [{ t: 'row', left: 'SOLD BEFORE THE TOP', right: `-${usd(p.missedUsd)}`, tone: 'neg' } as Line] : []),
      ...(p.unknownSold > 0 ? [{ t: 'row', left: 'SOLD, COST UNKNOWN', right: compact(p.unknownSold), muted: true } as Line] : []),
      { t: 'dash' },
      { t: 'total', left: 'P&L', right: usd(p.pnl, { signed: true }), sub: p.roi === null ? 'no buys seen' : pct(p.roi, { signed: true }), tone: toneOf(p.pnl) },
      ...(r.of > 1 ? [{ t: 'row', left: 'VS RECENT TRADERS', right: `#${r.place} of ${r.of}` } as Line] : []),
      { t: 'rank', name: rank.name, line: rank.line },
      { t: 'barcode', seed: `${r.owner}:${token.address}` },
      { t: 'center', text: SITE_HOST, muted: true },
      { t: 'center', text: 'not financial advice', muted: true },
    ],
    stamp: stampOf(p.pnl),
  };
}
