'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, currentTheme, type Theme } from '../lib/theme';
import { cx } from '../lib/cx';

/** Day or night: flips the page and remembers it in this browser. */
export function ThemeToggle({ className }: { className?: string }) {
  // the theme is only known in the browser; until then the button shows nothing that could disagree
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page's theme only exists after mount
    setTheme(currentTheme());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => setTheme(currentTheme());
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      className={cx('btn btn-ghost h-10 min-h-0 px-2.5', className)}
      aria-label={next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={next === 'dark' ? 'Dark mode' : 'Light mode'}
    >
      {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className={cx('size-4', !theme && 'opacity-0')} aria-hidden />}
    </button>
  );
}
