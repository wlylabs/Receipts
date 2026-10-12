'use client';

import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import type { ApiError } from '../lib/types';

/** The printer feeding paper while an address is read. */
export function Printing({ what }: { what: string }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-16 text-center" role="status" aria-live="polite">
      <div className="relative h-36 w-56">
        <div className="absolute inset-x-0 top-0 z-10 h-10 rounded-xl border border-line bg-ink shadow-lg">
          <div className="absolute inset-x-6 bottom-2 h-1.5 rounded-full bg-black/60" />
          <span className="absolute right-3 top-3 size-2 animate-pulse rounded-full bg-hi" />
        </div>
        <div className="absolute inset-x-8 top-8 h-28 overflow-hidden">
          <div className="paper feed h-40 px-3 pt-6">
            {[70, 90, 55, 80, 65, 85].map((w, i) => (
              <div key={i} className="mb-2 h-1.5 rounded-sm bg-[#d9d3c4]" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-4 text-lg font-semibold">Printing…</p>
      <p className="mt-1 text-sm text-muted">{what}</p>
    </div>
  );
}

export function Failure({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const title =
    error.code === 'not-found' ? 'Token not found' : error.code === 'unsupported' ? 'Chain not supported yet' : error.code === 'no-trades' ? 'Nothing to print' : error.code === 'invalid' ? 'That address doesn’t parse' : 'The printer jammed';
  return (
    <div className="card mx-auto max-w-md p-6 text-center" role="alert">
      <p className="text-2xl font-bold">{title}</p>
      <p className="mt-2 text-ink-2">{error.error}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {error.code === 'upstream' && (
          <button type="button" onClick={onRetry} className="btn btn-hi">
            <RotateCw className="size-4" aria-hidden /> Try again
          </button>
        )}
        <Link href="/#paste" className="btn btn-ghost">
          Paste another
        </Link>
      </div>
    </div>
  );
}
