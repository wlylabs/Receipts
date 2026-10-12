'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiError } from '../lib/types';

export type ApiState<T> = { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'ready'; data: T };

/** GETs one of this app's own endpoints; `reload` asks again. */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ url: string; value: ApiState<T> } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as T | ApiError | null;
        if (!res.ok || !body) {
          const err = body && 'code' in (body as object) ? (body as ApiError) : { code: 'upstream' as const, error: 'Something went wrong. Try again.' };
          setState({ url, value: { status: 'error', error: err } });
        } else setState({ url, value: { status: 'ready', data: body as T } });
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setState({ url, value: { status: 'error', error: { code: 'upstream', error: 'You look offline. Check the connection and try again.' } } });
      });
    return () => ctrl.abort();
  }, [url, tick]);

  const reload = useCallback(() => {
    setState(null);
    setTick((t) => t + 1);
  }, []);
  const value: ApiState<T> = state && state.url === url ? state.value : { status: 'loading' };
  return { state: value, reload };
}
