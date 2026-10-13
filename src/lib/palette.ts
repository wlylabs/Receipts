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
 * X in dark mode ("Lights out"), for a video made to sit in a dark timeline: black, light greys,
 * dark hairlines, and the same green and red.
 */
export const X_DARK = {
  bg: '#000000',
  ink: '#e7e9ea',
  ink2: '#c4c8cb',
  muted: '#71767b',
  line: '#2f3336',
  subtle: '#16181c',
  pos: '#00ba7c',
  neg: '#f4212e',
  posWash: '#071d15',
  negWash: '#250609',
} as const;

export type VideoTheme = 'light' | 'dark';
