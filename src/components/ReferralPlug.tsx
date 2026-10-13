import { ArrowUpRight } from 'lucide-react';
import type { Plug } from '../lib/referral';
import { cx } from '../lib/cx';
import { FmathLogo } from './FmathLogo';

/** fomo's 10% referral, pitched with what this page just showed, and FMath to check the math. */
export function ReferralPlug({ plug, className }: { plug: Plug; className?: string }) {
  return (
    <div className={cx('panel flex items-start gap-3 p-4', className)}>
      <FmathLogo className="size-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="label flex items-center gap-1.5 text-[9.5px]">
          FMath · 10% off fomo fees <span className="rounded-sm bg-subtle px-1 text-faint">Ad</span>
        </p>
        <p className="mt-0.5 text-[14px] font-semibold leading-snug">{plug.title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{plug.body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <a href={plug.href} target="_blank" rel="sponsored noopener" className="btn btn-primary h-9 min-h-0 px-3 text-[13px]">
            {plug.cta} <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
          {plug.calc && (
            <a href={plug.calc.href} target="_blank" rel="noopener" className="text-[12.5px] font-medium text-ink-2 underline-offset-2 hover:underline">
              {plug.calc.cta}
            </a>
          )}
        </div>
        <p className="mt-2.5 text-[10.5px] leading-snug text-faint">Referral link: when you sign up through it, Willy, who makes FMath, gets fomo referral rewards. Your discount is the same either way.</p>
      </div>
    </div>
  );
}
