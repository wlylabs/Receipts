import 'server-only';
import { candles, findPair, onOtherChain, poolTrades, timeframeFor } from './upstream';
import { isAddress, toSeries, toTokenInfo, toTrades } from './receipts';
import { SUPPORTED } from './chains';
import type { ApiError, TokenInfo, Trade } from './types';

export interface Loaded {
  token: TokenInfo;
  series: [number, number][];
  candle: string;
  ath: { ts: number; priceUsd: number };
  highs: [number, number][];
  trades: Trade[];
}

export type LoadResult = { ok: true; value: Loaded } | { ok: false; code: ApiError['code']; error: string };

/** A token (or a pair) by address: its deepest pool, the pool's candles since it opened, and its latest trades. */
export async function loadToken(address: string): Promise<LoadResult> {
  if (!isAddress(address)) return { ok: false, code: 'invalid', error: 'That is not a token address.' };
  const found = await findPair(address);
  if (!found) {
    const other = await onOtherChain(address).catch(() => null);
    if (other) return { ok: false, code: 'unsupported', error: `That token trades on ${other}. Receipts plays ${SUPPORTED.join(', ')}.` };
    return { ok: false, code: 'not-found', error: 'DexScreener has no pair for this address.' };
  }
  const token = toTokenInfo(found.pair);
  const age = token.createdAt ? Date.now() / 1000 - token.createdAt : 400 * 86_400;
  const tf = timeframeFor(age);
  const [ohlcv, raw] = await Promise.all([candles(token.chain, token.pair, token.address, tf), poolTrades(token.chain, token.pair)]);
  const { series, ath, highs } = toSeries(ohlcv);
  return { ok: true, value: { token, series, candle: tf.label, ath, highs, trades: toTrades(raw, token.address) } };
}
