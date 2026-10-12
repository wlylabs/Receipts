import type { Marker } from '../components/ReplayChart';
import type { Stat } from '../components/ResultCard';
import { RANKS, toneOf } from './game';
import { position, priceAt, rankOf, supplyOf } from './receipts';
import { bucket, mergeMarkers, type Candle } from './candles';
import type { Trade, TraderReceipts } from './types';
import { dateTime, day, mcap, pct, price, short, usd } from './format';
import { walletVerdict } from './story';
import type { ReplayVideo } from './replayVideo';

/** Most candles drawn at once in a replay. */
export const REPLAY_CANDLES = 80;

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
export function traderStory(r: TraderReceipts): TraderStory {
  const p = r.position;
  const { token, series } = r;
  const trades: Trade[] = r.trades.map(([ts, side, tokens, u, pr, tx]) => ({ ts, side, tokens, usd: u, priceUsd: pr, tx, trader: r.owner }));

  // the replay runs from the wallet's first trade to now, over the token's whole history
  const from = Math.max(series[0]?.[0] ?? 0, (trades[0]?.ts ?? 0) - 60);
  const to = Math.max(series.at(-1)?.[0] ?? 0, trades.at(-1)?.ts ?? 0);
  // every candle since launch, merged down to a count that stays readable on a phone
  const chart = bucket(r.candles, REPLAY_CANDLES);
  // DEX traders read market cap more than price: the supply turns one into the other
  const supply = supplyOf(token);
  const scale = supply || 1;
  const label = supply ? mcap : price;
  const at = (pr: number) => (supply ? `${mcap(pr * supply)} MC` : price(pr));
  const rank = RANKS[rankOf(p.roi)];
  const firstBuy = trades.find((t) => t.side === 'buy');
  const lastSell = trades.filter((t) => t.side === 'sell').at(-1);
  const stats: Stat[] = [
    { k: 'Put in', v: usd(p.usdIn) },
    { k: 'Took out', v: usd(p.usdOut) },
    { k: p.buys > 1 ? 'First buy' : 'Bought', v: firstBuy ? dateTime(firstBuy.ts) : '-' },
    { k: p.sells > 1 ? 'Last sell' : 'Sold', v: lastSell ? dateTime(lastSell.ts) : 'Still holding' },
    { k: 'Bag now', v: usd(p.openValue) },
    { k: 'Trades', v: `${p.buys} buys · ${p.sells} sells` },
    { k: 'Realized', v: usd(p.realized, { signed: true }), tone: toneOf(p.realized) },
    { k: 'Unrealized', v: usd(p.unrealized, { signed: true }), tone: toneOf(p.unrealized) },
    ...(p.missedUsd > 0.005 ? [{ k: 'Sold before top', v: `-${usd(p.missedUsd)}`, tone: 'neg' as const }] : []),
    ...(r.of > 1 ? [{ k: 'vs traders', v: `#${r.place} of ${r.of}` }] : []),
  ];

  // one marker per candle, so trades close together do not pile up
  const markers = mergeMarkers(
    trades.map((t) => ({ ts: t.ts, price: t.priceUsd, kind: t.side })),
    chart.candles,
    chart.step,
  );
  const pnlAt = (ts: number) => {
    if (ts >= to) return p.pnl;
    const seen = trades.filter((t) => t.ts <= ts);
    return seen.length ? position(seen, priceAt(series, ts, token.priceUsd)).pnl : 0;
  };
  const story = { buys: p.buys, sells: p.sells, usdIn: p.usdIn, pnl: p.pnl, roi: p.roi, realized: p.realized, unrealized: p.unrealized, openValue: p.openValue, missedUsd: p.missedUsd };
  const video: ReplayVideo = {
    kicker: short(r.owner),
    symbol: token.symbol,
    chainName: token.chainName,
    verdict: walletVerdict(story, (n) => usd(n)),
    series,
    candles: chart.candles,
    step: chart.step,
    from,
    to,
    markers: markers.length <= 60 ? markers : [],
    captions: trades.map((t) => ({ ts: t.ts, text: `${t.side === 'buy' ? 'Buy' : 'Sell'} ${usd(t.usd)} at ${at(t.priceUsd)}`, tone: t.side === 'buy' ? ('pos' as const) : ('neg' as const) })),
    pnlAt,
    pnl: p.pnl,
    pnlText: usd(p.pnl, { signed: true }),
    roiText: p.roi === null ? null : pct(p.roi, { signed: true }),
    rank,
    stats: stats.slice(0, 4),
    money: (n) => usd(n, { signed: true }),
    scale,
    label,
    date: day,
  };
  const fileBase = `${r.owner.slice(0, 6)}-${token.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'token'}`;
  return { trades, chart, markers, stats, rank, from, to, supply, scale, label, video, fileBase };
}
