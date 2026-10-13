import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cx } from '../lib/cx';

export interface Crumb {
  /** What this step is: Token, Wallet, Replay. */
  step: string;
  label: string;
  href?: string;
}

/**
 * Where the page sits in the flow, token to wallet to replay, each step a link back. It is what
 * tells people how they got here and how to go one level up.
 */
export function Trail({ crumbs, className }: { crumbs: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cx('no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <ol className="flex w-max items-center gap-1 text-[12.5px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const body = (
            <>
              <span className="label text-[9.5px]">{c.step}</span>
              <span className={cx('mono max-w-[14ch] truncate', last ? 'font-semibold text-ink' : 'text-ink-2')}>{c.label}</span>
            </>
          );
          return (
            <li key={`${c.step}:${c.label}`} className="flex items-center gap-1">
              {c.href && !last ? (
                <Link href={c.href} className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-hover">
                  {body}
                </Link>
              ) : (
                <span className={cx('flex items-center gap-1.5 rounded-md px-2 py-1', last && 'bg-surface ring-1 ring-line')} aria-current={last ? 'page' : undefined}>
                  {body}
                </span>
              )}
              {!last && <ChevronRight className="size-3.5 text-faint" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
