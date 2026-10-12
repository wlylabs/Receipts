'use client';

import { barcode, type Line, type ReceiptDoc } from '../lib/receiptDoc';
import type { Tone } from '../lib/game';
import { cx } from '../lib/cx';

const toneText = (t: Tone | undefined) => (t === 'pos' ? 'text-[#15803d]' : t === 'neg' ? 'text-[#b91c1c]' : '');

/**
 * Thermal paper. `shown` lines have printed so far; the stamp lands once all of them have.
 */
export function Receipt({ doc, shown = Infinity, animate = true, className }: { doc: ReceiptDoc; shown?: number; animate?: boolean; className?: string }) {
  const lines = doc.lines.slice(0, shown);
  const done = shown >= doc.lines.length;
  return (
    <div className={cx('paper mx-auto w-full max-w-[380px] px-5 pb-6 pt-6 text-[12.5px] leading-[1.55] sm:px-6', className)}>
      <div className="relative">
        {lines.map((l, i) => (
          <div key={i} className={animate ? 'print-in' : undefined}>
            <LineView line={l} />
          </div>
        ))}
        {!done && <div className="mt-1 h-3 w-2/3 animate-pulse rounded-sm bg-[#e4e4e7]" aria-hidden />}
        {done && (
          <div className="pointer-events-none absolute -right-3 -top-3 sm:-right-4" aria-hidden>
            <span className={cx('stamp inline-block', animate && 'stamp-in', 'bg-white/85 text-xl sm:text-2xl', doc.stamp.tone === 'pos' ? 'text-[#15803d]' : doc.stamp.tone === 'neg' ? 'text-[#b91c1c]' : 'text-[#71717a]')}>
              {doc.stamp.text}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function LineView({ line: l }: { line: Line }) {
  switch (l.t) {
    case 'title':
      return <p className="text-center text-lg font-bold tracking-[0.22em]">{l.text}</p>;
    case 'center':
      return <p className={cx('text-center', l.muted && 'text-[#71717a]')}>{l.text}</p>;
    case 'row':
      return (
        <p className={cx('flex justify-between gap-3', l.muted && 'text-[#71717a]')}>
          <span className="min-w-0 truncate">{l.left}</span>
          <span className={cx('num shrink-0 text-right', toneText(l.tone))}>{l.right}</span>
        </p>
      );
    case 'item':
      return (
        <div className="py-0.5">
          <p className="flex justify-between gap-3 font-bold">
            <span className="min-w-0 truncate">{l.name}</span>
            <span className={cx('num shrink-0', toneText(l.tone))}>{l.right}</span>
          </p>
          <p className="truncate text-[11.5px] text-[#71717a]">{l.sub}</p>
        </div>
      );
    case 'dash':
      return <div className="dash my-2.5" />;
    case 'total':
      return (
        <div className="py-1">
          <p className="flex items-baseline justify-between gap-3 text-[16px] font-bold">
            <span>{l.left}</span>
            <span className={cx('num', toneText(l.tone))}>{l.right}</span>
          </p>
          {l.sub && <p className={cx('num text-right text-[12px]', toneText(l.tone))}>{l.sub}</p>}
        </div>
      );
    case 'rank':
      return (
        <div className="my-2 border border-[#18181b] px-3 py-2.5 text-center">
          <p className="text-[10.5px] tracking-[0.2em] text-[#71717a]">RANK</p>
          <p className="text-base font-bold uppercase tracking-[0.12em]">{l.name}</p>
          <p className="text-[11.5px] leading-snug">{l.line}</p>
        </div>
      );
    case 'barcode':
      return (
        <div className="mt-3 flex h-10 items-stretch justify-center gap-[2px]" aria-hidden>
          {barcode(l.seed).map((w, i) => (
            <span key={i} className={i % 2 ? 'bg-transparent' : 'bg-[#18181b]'} style={{ width: w * 1.6 }} />
          ))}
        </div>
      );
    case 'space':
      return <div className="h-2" />;
  }
}
