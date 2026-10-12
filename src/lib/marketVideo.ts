import { bucket, upTo } from './candles';
import { marketOf } from './market';
import { supplyOf } from './receipts';
import { marketVerdict, sinceLaunch } from './story';
import type { TokenReceipts } from './types';
import { day, mcap, pct, price, span, usd } from './format';
import type { Caption, ReplayVideo } from './replayVideo';
import { REPLAY_CANDLES } from './traderVideo';

/** Most captions in the story cut, launch and ATH included. */
const MAX_CAPTIONS = 8;

/**
 * A video of the token's whole market, launch to now: every candle the feed has, merged down to a
 * readable count, the market cap counting up with the playhead, a caption at launch, at each new
 * high, at the top and on the way down, then where it stands now.
 */
export function marketStory(r: TokenReceipts, now = Date.now() / 1000): { video: ReplayVideo; fileBase: string } | null {
  const { token } = r;
  const chart = bucket(r.candles, REPLAY_CANDLES);
  const first = chart.candles[0];
  if (chart.candles.length < 2 || !first) return null;
  // DEX traders read market cap more than price: the supply turns one into the other
  const supply = supplyOf(token);
  const scale = supply || 1;
  const label = supply ? mcap : price;
  const at = (p: number) => (supply ? `${mcap(p * supply)} MC` : price(p));
  const launch = first[1];
  const live = token.priceUsd > 0 ? token.priceUsd : chart.candles.at(-1)![4];
  const ath = Math.max(r.ath.priceUsd, ...chart.candles.map((k) => k[2]));
  const from = first[0];
  const to = chart.candles.at(-1)![0] + chart.step;
  const priceAt = (ts: number) => (ts >= to ? live : (upTo(chart.candles, chart.step, ts).at(-1)?.[4] ?? launch));

  // the run's milestones: launch, each new high a big step over the last one called, the top, the way down
  const captions: Caption[] = [{ ts: from, text: `Launched at ${at(launch)}`, tone: null }];
  const athAt = chart.candles.find((k) => k[2] >= ath * 0.999)?.[0] ?? r.ath.ts;
  const factor = Math.max(2, (ath / launch) ** (1 / (MAX_CAPTIONS - 4)));
  let called = launch;
  for (const [ts, , h] of chart.candles) {
    if (ts >= athAt) break;
    if (h >= called * factor) {
      captions.push({ ts, text: `New high · ${at(h)}`, tone: 'pos' });
      called = h;
    }
  }
  if (ath > launch * 1.05) captions.push({ ts: athAt, text: `All-time high · ${at(ath)}`, tone: 'pos' });
  for (const drop of [0.5, 0.9]) {
    const k = chart.candles.find(([ts, , , , c]) => ts > athAt && c <= ath * (1 - drop));
    if (k) captions.push({ ts: k[0], text: `${pct(drop)} off the top · ${at(k[4])}`, tone: 'neg' });
  }

  const market = marketOf({ priceUsd: live, athUsd: ath, change24h: token.change24h, buys: r.window.buys, sells: r.window.sells });
  const run = { now: live, launch, ath };
  const video: ReplayVideo = {
    kicker: token.createdAt ? `${span(now - token.createdAt)} since launch` : 'Since launch',
    symbol: token.symbol,
    chainName: token.chainName,
    verdict: marketVerdict(run),
    series: r.series,
    candles: chart.candles,
    step: chart.step,
    from,
    to,
    markers: [],
    captions: captions.sort((a, b) => a.ts - b.ts),
    pnlAt: (ts) => priceAt(ts) - launch,
    counter: (ts) => at(priceAt(ts)),
    pnl: live - launch,
    pnlText: at(live),
    roiText: sinceLaunch(run),
    rank: { name: market.label, line: market.line },
    stats: [
      { k: supply ? 'Launch MC' : 'Launch', v: label(launch * scale) },
      { k: supply ? 'ATH MC' : 'ATH', v: label(ath * scale) },
      { k: 'From ATH', v: pct(Math.min(0, live / ath - 1), { signed: true }) },
      { k: 'Liquidity', v: usd(token.liquidityUsd) },
    ],
    money: (n) => usd(n, { signed: true }),
    scale,
    label,
    date: day,
  };
  const fileBase = `${token.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'token'}-market`;
  return { video, fileBase };
}
