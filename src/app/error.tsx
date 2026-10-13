'use client';

import Link from 'next/link';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="mono mx-auto inline-block rounded-md border border-dashed border-line-strong px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-muted">Paper jam</p>
      <h1 className="mt-4 text-[22px] font-bold tracking-tight">Something broke</h1>
      <p className="mt-2 text-muted">The page hit an error while loading. Try again, or start over from home.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-quiet">
          Home
        </Link>
      </div>
    </div>
  );
}
