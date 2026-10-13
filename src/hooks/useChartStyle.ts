'use client';

import { useCallback } from 'react';
import { KEYS } from '../lib/game';
import { DEFAULT_STYLE, styleOf, type ChartStyle } from '../lib/chartStyle';
import { useStored } from './useStored';

/** The candle style picked in this browser, shared by every chart and the video. */
export function useChartStyle(): [ChartStyle, (next: Partial<ChartStyle>) => void] {
  const [raw, setRaw] = useStored<ChartStyle>(KEYS.chartStyle, DEFAULT_STYLE);
  const set = useCallback((next: Partial<ChartStyle>) => setRaw((prev) => styleOf({ ...styleOf(prev), ...next })), [setRaw]);
  return [styleOf(raw), set];
}
