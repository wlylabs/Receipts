'use client';

import { useState } from 'react';
import { cx } from '../lib/cx';

/** A token's logo from its metadata, or its ticker's first letter when there is none or it won't load. */
export function TokenImage({ src, symbol, className }: { src: string | null; symbol: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken)
    return (
      <span className={cx('grid shrink-0 place-items-center rounded-full bg-hi font-bold text-hi-ink', className)} aria-hidden>
        {symbol.slice(0, 1).toUpperCase()}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element -- remote IPFS logos, any host
  return <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cx('shrink-0 rounded-full bg-surface-2 object-cover', className)} />;
}
