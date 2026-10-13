import { ArrowUpRight, Calculator } from 'lucide-react';
import type { Plug } from '../lib/fmath';
import { cx } from '../lib/cx';

/** A card that sends the reader to FMath with this trade's numbers filled in. */
export function FmathPlug({ plug, className }: { plug: Plug; className?: string }) {
  return (
    <a href={plug.href} target="_blank" rel="noopener" className={cx('panel group flex items-start gap-3 p-4 transition-colors hover:border-line-strong', className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-on-accent" aria-hidden>
        <Calculator className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="label flex items-center gap-1.5 text-[9.5px]">
          FMath <span className="rounded-sm bg-subtle px-1 text-faint">Ad</span>
        </span>
        <span className="mt-0.5 block text-[14px] font-semibold leading-snug">{plug.title}</span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">{plug.body}</span>
        <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold underline-offset-2 group-hover:underline">
          {plug.cta} <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      </span>
    </a>
  );
}
