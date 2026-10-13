import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { TokenImage } from './TokenImage';
import { cx } from '../lib/cx';

/** A list row: logo, ticker and a line under it, then numbers on the right. */
export function TokenRow({ href, image, symbol, sub, right, rightSub, rightTone }: { href: string; image: string | null; symbol: string; sub: ReactNode; right: ReactNode; rightSub?: ReactNode; rightTone?: 'pos' | 'neg' | null }) {
  return (
    <Link href={href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover/60">
      <TokenImage src={image} symbol={symbol} className="size-8 text-[13px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{symbol}</span>
        <span className="mono block truncate text-[11.5px] text-muted">{sub}</span>
      </span>
      <span className="text-right">
        <span className={cx('mono block text-[13.5px] font-medium', rightTone === 'pos' && 'text-pos', rightTone === 'neg' && 'text-neg')}>{right}</span>
        {rightSub && <span className="num block text-[12.5px] text-muted">{rightSub}</span>}
      </span>
      <span className="chip hidden group-hover:border-ink group-hover:bg-accent group-hover:text-on-accent sm:inline-flex">
        Replay <ChevronRight className="size-3" aria-hidden />
      </span>
    </Link>
  );
}
