'use client';

import { useCallback, useEffect, useState } from 'react';

const EVENT = 'receipts:stored';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * A value kept in this browser. It reads after mount, so the server render and the first client
 * render agree, and every hook on the same key stays in step.
 */
export function useStored<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage only exists after mount
    setValue(read(key, fallback));
    const sync = (e: Event) => {
      if (!(e instanceof CustomEvent) || e.detail === key) setValue(read(key, fallback));
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
    // the fallback is a constant at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {
          // private mode or full storage: keep it for this visit only
        }
        queueMicrotask(() => window.dispatchEvent(new CustomEvent(EVENT, { detail: key })));
        return v;
      });
    },
    [key],
  );

  return [value, set];
}
