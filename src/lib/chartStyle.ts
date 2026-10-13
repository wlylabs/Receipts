import { heikinAshi, type Candle } from './candles';

/** How the candles are drawn: their shape and their colours. Money stays green and red either way. */
export interface ChartStyle {
  kind: 'candles' | 'heikin-ashi';
  colors: CandleColors;
}

export type CandleColors = 'classic' | 'ocean' | 'mono';

export const DEFAULT_STYLE: ChartStyle = { kind: 'candles', colors: 'classic' };

/**
 * The colour sets, for the page (CSS, following light and dark) and for the video (the X light
 * palette it is drawn in). Ocean is blue and orange, which tell apart for colour-blind eyes too.
 */
export const COLORS: Record<CandleColors, { label: string; up: string; down: string; videoUp: string; videoDown: string }> = {
  classic: { label: 'Green / red', up: 'var(--pos)', down: 'var(--neg)', videoUp: '#00ba7c', videoDown: '#f4212e' },
  ocean: { label: 'Blue / orange', up: '#2f80ed', down: '#f2994a', videoUp: '#2f80ed', videoDown: '#f2994a' },
  mono: { label: 'Mono', up: 'var(--ink)', down: 'var(--faint)', videoUp: '#0f1419', videoDown: '#aab8c2' },
};

export const KINDS: Record<ChartStyle['kind'], string> = { candles: 'Candles', 'heikin-ashi': 'Heikin Ashi' };

/** A stored style, made safe: anything unknown falls back to the default. */
export function styleOf(raw: unknown): ChartStyle {
  const s = (raw ?? {}) as Partial<ChartStyle>;
  return { kind: s.kind && s.kind in KINDS ? s.kind : DEFAULT_STYLE.kind, colors: s.colors && s.colors in COLORS ? s.colors : DEFAULT_STYLE.colors };
}

/** The candles as the style draws them. */
export const shape = (candles: readonly Candle[], kind: ChartStyle['kind']): readonly Candle[] => (kind === 'heikin-ashi' ? heikinAshi(candles) : candles);
