/** Light or dark, picked by hand; with neither stored, the page follows the system. */
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'receipts:theme';

/**
 * Runs in <head> before the first paint, so a page picked dark never flashes light: it copies the
 * stored pick onto <html data-theme>, where the CSS reads it.
 */
export const THEME_SCRIPT = `try{var t=JSON.parse(localStorage.getItem('${THEME_KEY}'));if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

/** The theme on screen now: the hand pick, or the system's. */
export function currentTheme(): Theme {
  const picked = document.documentElement.dataset.theme;
  if (picked === 'light' || picked === 'dark') return picked;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // private mode or full storage: keep it for this visit only
  }
}
