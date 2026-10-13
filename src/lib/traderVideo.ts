import type { Marker } from '../components/ReplayChart';
import type { Stat } from '../components/ResultCard';
import { RANKS, toneOf } from './game';
import { position, priceAt, rankOf, supplyOf } from './receipts';
import { bucket, mergeMarkers, type Candle } from './candles';
import type { Trade, TraderReceipts } from './types';
import { compact, dateTime, day, mcap, price, short, span, usd } from './format';
import { timeOf, type Caption, type Pop, type ReplayVideo } from './replayVideo';

/** Most candles drawn at once in a replay. */
export const REPLAY_CANDLES = 80;

/** Most of the run's big moments told in the story cut. */
const MAX_BEATS = 5;
/** Seconds of the story cut kept between two moments, so each can be read. */
const BEAT_GAP = 1.4;

export interface TraderStory {
  trades: Trade[];
  chart: { candles: Candle[]; step: number };
  markers: Marker[];
  stats: Stat[];
  rank: { name: string; line: string };
  from: number;
  to: number;
  supply: number;
  scale: number;
  label: (v: number) => string;
  video: ReplayVideo;
  fileBase: string;
}

/**
 * Everything a wallet's replay and its video are drawn from: its trades over the token's whole
 * history, the chart merged down to a readable count, the markers, the numbers and the video.
 */
export function traderStory(r: TraderReceipts, opts: { maxCandles?: number } = {}): TraderStory {
  const p = r.position;
  const { token, series } = r;
  const trades: Trade[] = r.trades.map(([ts, side, tokens, u, pr, tx, kind, priced, feeUsd]) => ({ ts, side, tokens, usd: u, priceUsd: pr, tx, trader: r.owner, kind, priced, feeUsd }));

  // the replay runs from the wallet's first trade to now, over the token's whole history
  const from = Math.max(series[0]?.[0] ?? 0, (trades[0]?.ts ?? 0) - 60);
  const to = Math.max(series.at(-1)?.[0] ?? 0, trades.at(-1)?.ts ?? 0);
  // every candle given (since launch, or the stretch picked), merged down to a count that stays readable
  const chart = bucket(r.candles, opts.maxCandles ?? REPLAY_CANDLES);
  // DEX traders read market cap more than price: the supply turns one into the other
  const supply = supplyOf(token);
  const scale = supply || 1;
  const label = supply ? mcap : price;
  const at = (pr: number) => (supply ? `${mcap(pr * supply)} MC` : price(pr));
  const rank = RANKS[rankOf(p.roi)];
  const swaps = trades.filter((t) => t.kind !== 'transfer');
  const firstBuy = swaps.find((t) => t.side === 'buy');
  const lastSell = swaps.filter((t) => t.side === 'sell').at(-1);
  // how long the bag was held: first buy to the last sell, or to now while some is still held
  const heldUntil = p.open > 0 || !lastSell ? Math.max(to, Date.now() / 1000) : lastSell.ts;
  const stats: Stat[] = [
    { k: 'Put in', v: usd(p.usdIn) },
    { k: 'Took out', v: usd(p.usdOut) },
    { k: p.buys > 1 ? 'First buy' : 'Bought', v: firstBuy ? dateTime(firstBuy.ts) : '-' },
    { k: p.sells > 1 ? 'Last sell' : 'Sold', v: lastSell ? dateTime(lastSell.ts) : 'Still holding' },
    { k: 'Bag now', v: usd(p.openValue) },
    { k: 'Trades', v: `${p.buys} buys · ${p.sells} sells` },
    { k: 'Realized', v: usd(p.realized, { signed: true }), tone: toneOf(p.realized) },
    { k: 'Unrealized', v: usd(p.unrealized, { signed: true }), tone: toneOf(p.unrealized) },
    ...(firstBuy && heldUntil > firstBuy.ts ? [{ k: 'Held', v: span(heldUntil - firstBuy.ts) }] : []),
    ...(p.feesUsd > 0.005 ? [{ k: 'Fees paid', v: `-${usd(p.feesUsd)}`, tone: 'neg' as const }] : []),
    ...(p.received > 0 || p.sent > 0 ? [{ k: 'Transfers', v: `${compact(p.received)} in · ${compact(p.sent)} out` }] : []),
    ...(p.unknownSold > 0 ? [{ k: 'Sold, buy not seen', v: `${compact(p.unknownSold)} ${token.symbol}` }] : []),
    ...(p.missedUsd > 0.005 ? [{ k: 'Sold before top', v: `-${usd(p.missedUsd)}`, tone: 'neg' as const }] : []),
    ...(r.of > 1 ? [{ k: 'vs traders', v: `#${r.place} of ${r.of}` }] : []),
  ];

  // one marker per candle and side, like OKX's chart
  const markers = mergeMarkers(
    swaps.map((t) => ({ ts: t.ts, price: t.priceUsd, kind: t.side })),
    chart.candles,
    chart.step,
  );
  const pnlAt = (ts: number) => {
    if (ts >= to) return p.pnl;
    const seen = trades.filter((t) => t.ts <= ts);
    return seen.length ? position(seen, priceAt(series, ts, token.priceUsd)).pnl : 0;
  };
  const video: ReplayVideo = {
    kicker: short(r.owner),
    symbol: token.symbol,
    chainName: token.chainName,
    series,
    candles: chart.candles,
    step: chart.step,
    from,
    to,
    markers: markers.length <= 60 ? markers : [],
    captions: [],
    pnlAt,
    pnl: p.pnl,
    money: (n) => usd(n, { signed: true }),
    scale,
    label,
    date: day,
  };
  video.pops = sellPops(trades, video.markers);
  video.notes = buyNotes(trades, video.markers);
  video.captions = beats(trades, video, at);
  // the long cut closes on the receipt: the numbers that made the P&L, and the rank stamped on it
  const pick = new Set(['Put in', 'Took out', 'Trades', 'Realized', 'Unrealized', 'Held', 'Fees paid', 'vs traders']);
  video.outro = {
    title: `${short(r.owner)} on $${token.symbol}`,
    lines: stats.filter((st) => pick.has(st.k)).slice(0, 7),
    stamp: { text: rank.name.toUpperCase(), tone: toneOf(p.pnl) },
  };
  const fileBase = `${r.owner.slice(0, 6)}-${token.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'token'}`;
  return { trades, chart, markers, stats, rank, from, to, supply, scale, label, video, fileBase };
}

const times = (x: number) => `${x.toFixed(x >= 10 ? 0 : 1)}×`;

/**
 * What each sell made over what its tokens cost (the average buy so far, as the position works it
 * out), summed per marker: a sell marker stands for every sell from it to the next.
 */
function sellPops(trades: readonly Trade[], markers: readonly Marker[]): Pop[] {
  const sums = new Map<Marker, { made: number; cost: number }>();
  trades.forEach((t, i) => {
    if (t.side !== 'sell') return;
    // the sell marker this sell was merged into: buys and sells have markers of their own
    let m: Marker | undefined;
    for (const k of markers) if (k.kind === 'sell' && k.ts <= t.ts) m = k;
    if (!m) return;
    const made = position(trades.slice(0, i + 1), t.priceUsd).realized - position(trades.slice(0, i), t.priceUsd).realized;
    const sum = sums.get(m) ?? { made: 0, cost: 0 };
    sum.made += made;
    sum.cost += t.usd - made;
    sums.set(m, sum);
  });
  return [...sums].map(([m, { made, cost }]) => {
    const x = cost > 0 ? (cost + made) / cost : 0;
    return { ts: m.ts, price: m.price, text: usd(made, { signed: true }) + (x >= 1.5 ? ` · ${times(x)}` : ''), tone: toneOf(made) };
  });
}

/** What each buy put in, summed per marker, for the long cut: a buy marker stands for every buy from it to the next. */
function buyNotes(trades: readonly Trade[], markers: readonly Marker[]): Pop[] {
  const sums = new Map<Marker, number>();
  for (const t of trades) {
    if (t.side !== 'buy' || t.kind === 'transfer') continue;
    let m: Marker | undefined;
    for (const k of markers) if (k.kind === 'buy' && k.ts <= t.ts) m = k;
    if (!m) continue;
    sums.set(m, (sums.get(m) ?? 0) + t.usd);
  }
  return [...sums].map(([m, put]) => ({ ts: m.ts, price: m.price, text: `${usd(put)} in`, tone: null }));
}

/**
 * The run's big moments, told in a few words: the way in, the biggest add, the best and worst it
 * stood on paper, and the way out (or the bag still held). At most MAX_BEATS, the most telling
 * first, and never two so close in the story cut that one can't be read.
 */
function beats(trades: readonly Trade[], v: ReplayVideo, at: (price: number) => string): Caption[] {
  const buys = trades.filter((t) => t.side === 'buy');
  const sells = trades.filter((t) => t.side === 'sell');
  const first = buys[0];
  if (!first) return [];
  const all = position(trades, v.series.at(-1)?.[1] ?? first.priceUsd);
  const cands: Caption[] = [{ ts: first.ts, text: `In at ${at(first.priceUsd)}`, tone: null }];

  // the way out: all of it (what it made is the counter's to say), or the first bite with the
  // rest still held
  const out = all.open <= all.tokensIn * 0.01;
  const lastSell = sells.at(-1);
  if (out && lastSell) cands.push({ ts: lastSell.ts, text: `Out at ${at(lastSell.priceUsd)}`, tone: toneOf(all.realized) });
  else {
    const bite = sells[0];
    if (bite) {
      const i = trades.indexOf(bite);
      const made = position(trades.slice(0, i + 1), bite.priceUsd).realized - position(trades.slice(0, i), bite.priceUsd).realized;
      cands.push({ ts: bite.ts, text: `Took ${usd(bite.usd)} off at ${at(bite.priceUsd)}`, tone: toneOf(made) });
    }
    cands.push({ ts: v.to, text: `Still holding ${usd(all.openValue)}`, tone: null });
  }

  // the best and the worst it stood, from the first buy on, when they say more than the end does
  let hi = { ts: 0, pnl: 0 };
  let lo = { ts: 0, pnl: 0 };
  for (const [ts] of v.series) {
    if (ts < first.ts || ts > v.to) continue;
    const pnl = v.pnlAt(ts);
    if (pnl > hi.pnl) hi = { ts, pnl };
    if (pnl < lo.pnl) lo = { ts, pnl };
  }
  const stake = Math.max(1e-9, position(trades.filter((t) => t.ts <= hi.ts), 0).usdIn);
  const worth = 0.15 * all.usdIn;
  if (hi.pnl > worth && hi.pnl - v.pnl > worth) {
    const x = 1 + hi.pnl / stake;
    cands.push({ ts: hi.ts, text: x >= 1.5 ? `Up ${times(x)} on paper` : `Up ${usd(hi.pnl)} on paper`, tone: 'pos' });
  }
  if (lo.pnl < -worth && v.pnl - lo.pnl > worth) cands.push({ ts: lo.ts, text: `Down ${usd(-lo.pnl)} at the low`, tone: 'neg' });

  // the biggest buy after the first
  const add = buys.slice(1).reduce<Trade | null>((b, t) => (!b || t.usd > b.usd ? t : b), null);
  if (add) cands.push({ ts: add.ts, text: `Added ${usd(add.usd)} at ${at(add.priceUsd)}`, tone: null });

  const kept: Caption[] = [];
  const when = (c: Caption) => timeOf(Math.max(c.ts, v.from), v, 'story');
  for (const c of cands) {
    if (kept.length >= MAX_BEATS) break;
    if (kept.every((k) => Math.abs(when(k) - when(c)) >= BEAT_GAP)) kept.push(c);
  }
  return kept.sort((a, b) => a.ts - b.ts);
}

const csvCell = (v: string | number) => (typeof v === 'number' ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The wallet's trades as a CSV file's text, for a spreadsheet or a tax tool. */
export function tradesCsv(r: TraderReceipts): string {
  const rows: (string | number)[][] = [['time_utc', 'side', 'kind', 'tokens', 'usd', 'price_usd', 'priced_from', 'fee_usd', 'tx', 'chain', 'token', 'token_address', 'wallet']];
  for (const [ts, side, tokens, u, pr, tx, kind, priced, fee] of r.trades)
    rows.push([new Date(ts * 1000).toISOString(), side, kind ?? 'swap', tokens, +u.toFixed(6), pr, priced === 'candle' ? 'chart' : 'trade', +(fee ?? 0).toFixed(6), tx, r.token.chain, r.token.symbol, r.token.address, r.owner]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}
