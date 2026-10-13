'use client';

import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import type { ApiError } from '../lib/types';

/** A quiet placeholder in the page's own shape while data loads. */
export function Loading({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="skeleton size-10 rounded-full" />
        <div className="space-y-2">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-3 w-48" />
        </div>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="skeleton aspect-[16/9] w-full rounded-[14px]" />
        <div className="skeleton h-80 rounded-[14px]" />
      </div>
      <p className="mt-4 text-[13px] text-muted">{what}</p>
    </div>
  );
}

export function Failure({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const title =
    error.code === 'not-found'
      ? 'Nothing found'
      : error.code === 'unsupported'
        ? 'Chain not supported yet'
        : error.code === 'no-trades'
          ? 'No trades to show'
          : error.code === 'invalid'
            ? 'Check the address'
            : error.code === 'busy'
              ? 'Too many at once'
              : 'Couldn’t load that';
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{error.error}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {(error.code === 'upstream' || error.code === 'busy') && (
          <button type="button" onClick={onRetry} className="btn btn-primary">
            <RotateCw className="size-4" aria-hidden /> Try again
          </button>
        )}
        <Link href="/#paste" className="btn btn-quiet">
          Paste another
        </Link>
      </div>
    </div>
  );
}
