import { heikinAshi, type Candle } from './candles';

/**
 * How the chart is drawn: candles, Heikin Ashi or a line through the closes, and the colours (a
 * line takes the buy colour when the run ended up, the sell colour when down). Money stays green
 * and red either way.
 */
export interface ChartStyle {
  kind: 'candles' | 'heikin-ashi' | 'line';
  colors: CandleColors | 'custom';
  /** The buy and sell candle colours picked by hand, used when `colors` is 'custom'. */
  up: string;
  down: string;
}

export type CandleColors = 'classic' | 'ocean';

export const DEFAULT_STYLE: ChartStyle = { kind: 'candles', colors: 'classic', up: '#12a150', down: '#e5322d' };

/** Colours offered for a hand-picked pair; any other comes from the system colour picker. */
export const SWATCHES = ['#12a150', '#26a69a', '#2f80ed', '#8b5cf6', '#e5322d', '#f2994a'];

/**
 * The colour sets, for the page (CSS, following light and dark) and for the video (the X light
 * palette it is drawn in). Ocean is blue and orange, which tell apart for colour-blind eyes too.
 */
export const COLORS: Record<CandleColors, { label: string; up: string; down: string; videoUp: string; videoDown: string }> = {
  classic: { label: 'Green / red', up: 'var(--pos)', down: 'var(--neg)', videoUp: '#00ba7c', videoDown: '#f4212e' },
  ocean: { label: 'Blue / orange', up: '#2f80ed', down: '#f2994a', videoUp: '#2f80ed', videoDown: '#f2994a' },
};

export const KINDS: Record<ChartStyle['kind'], string> = { candles: 'Candles', 'heikin-ashi': 'Heikin Ashi', line: 'Line' };

const hex = (c: unknown, or: string) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : or);

/** A stored style, made safe: anything unknown falls back to the default. */
export function styleOf(raw: unknown): ChartStyle {
  const s = (raw ?? {}) as Partial<ChartStyle>;
  return {
    kind: s.kind && s.kind in KINDS ? s.kind : DEFAULT_STYLE.kind,
    colors: s.colors === 'custom' || (s.colors && s.colors in COLORS) ? s.colors : DEFAULT_STYLE.colors,
    up: hex(s.up, DEFAULT_STYLE.up),
    down: hex(s.down, DEFAULT_STYLE.down),
  };
}

/** The buy and sell colours the style draws in, for the page and for the video. */
export function paletteOf(style: ChartStyle): { up: string; down: string; videoUp: string; videoDown: string } {
  if (style.colors === 'custom') return { up: style.up, down: style.down, videoUp: style.up, videoDown: style.down };
  return COLORS[style.colors];
}

/** The candles as the style draws them; a line runs through the real closes. */
export const shape = (candles: readonly Candle[], kind: ChartStyle['kind']): readonly Candle[] => (kind === 'heikin-ashi' ? heikinAshi(candles) : candles);
