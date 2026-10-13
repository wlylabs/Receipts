'use client';

import Link from 'next/link';
import { ArrowRight, Loader2, RotateCw } from 'lucide-react';
import type { ApiError } from '../lib/types';

/** A quiet placeholder in the page's own shape while data loads. */
export function Loading({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6" role="status" aria-live="polite">
      <p className="label flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> {what}
      </p>
      <div className="mt-5 flex items-center gap-3">
        <div className="skeleton size-12 rounded-full" />
        <div className="space-y-2">
          <div className="skeleton h-6 w-36" />
          <div className="skeleton h-3.5 w-52" />
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="skeleton aspect-[16/9] w-full rounded-[12px]" />
        <div className="skeleton h-80 rounded-[12px]" />
      </div>
    </div>
  );
}

/**
 * A page that couldn't load. `other` is the way out when the address may have been pasted as the
 * wrong kind: a wallet opened as a token, or a token opened as a wallet.
 */
export function Failure({ error, onRetry, other }: { error: ApiError; onRetry: () => void; other?: { label: string; href: string } }) {
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
      <p className="mono mx-auto inline-block rounded-md border border-dashed border-line-strong px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-muted">Void · no receipt</p>
      <p className="mt-4 text-[20px] font-bold tracking-tight">{title}</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{error.error}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {(error.code === 'upstream' || error.code === 'busy') && (
          <button type="button" onClick={onRetry} className="btn btn-primary">
            <RotateCw className="size-4" aria-hidden /> Try again
          </button>
        )}
        {other && error.code !== 'upstream' && error.code !== 'busy' && (
          <Link href={other.href} className="btn btn-primary">
            {other.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        <Link href="/#paste" className="btn btn-quiet">
          Try another address
        </Link>
      </div>
    </div>
  );
}
