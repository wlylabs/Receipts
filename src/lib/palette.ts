/**
 * The colours of X (Twitter) in light mode, for the video and the share image, so a post blends
 * into the timeline: the same white, text greys, hairlines, green and red.
 */
export const X_LIGHT = {
  bg: '#ffffff',
  ink: '#0f1419',
  ink2: '#36404a',
  muted: '#536471',
  line: '#eff3f4',
  subtle: '#f7f9f9',
  pos: '#00ba7c',
  neg: '#f4212e',
  posWash: '#e6f8f2',
  negWash: '#feeced',
} as const;

/**
 * The night chart colours of DexScreener (TradingView's dark theme), for a dark video: a deep
 * blue-grey rather than pure black, soft greys, faint grid lines, and the same green and red.
 */
export const NIGHT = {
  bg: '#131722',
  ink: '#d1d4dc',
  ink2: '#b2b5be',
  muted: '#787b86',
  line: '#2a2e39',
  subtle: '#1e222d',
  pos: '#00ba7c',
  neg: '#f4212e',
  posWash: '#0f2a26',
  negWash: '#2f1a20',
} as const;

export type VideoTheme = 'light' | 'dark';
