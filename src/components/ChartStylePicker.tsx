'use client';

import { useEffect, useRef, useState } from 'react';
import { CandlestickChart } from 'lucide-react';
import { useChartStyle } from '../hooks/useChartStyle';
import { COLORS, KINDS, type CandleColors, type ChartStyle } from '../lib/chartStyle';
import { cx } from '../lib/cx';

/** The candle shape and colours, as two quiet rows: shown inline, or behind a small button. */
export function ChartStylePicker({ inline = false, className }: { inline?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // a click outside or Escape puts the menu away
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', away);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', away);
    };
  }, [open]);

  if (inline) return <Rows className={className} />;
  return (
    <div ref={box} className={cx('relative', className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Candle style" title="Candle style" className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink">
        <CandlestickChart className="size-4" aria-hidden />
      </button>
      {open && (
        <div className="panel fade-in absolute right-0 top-full z-20 mt-1.5 w-60 p-3">
          <Rows />
        </div>
      )}
    </div>
  );
}

function Rows({ className }: { className?: string }) {
  const [style, set] = useChartStyle();
  return (
    <div className={cx('space-y-2.5', className)}>
      <div role="radiogroup" aria-label="Candle shape" className="flex rounded-full bg-subtle p-0.5 text-[12.5px]">
        {(Object.keys(KINDS) as ChartStyle['kind'][]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={style.kind === k}
            onClick={() => set({ kind: k })}
            className={cx('h-8 flex-1 rounded-full px-2.5 font-medium transition-all', style.kind === k ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-muted hover:text-ink')}
          >
            {KINDS[k]}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Candle colours" className="flex gap-1.5">
        {(Object.keys(COLORS) as CandleColors[]).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={style.colors === c}
            aria-label={COLORS[c].label}
            title={COLORS[c].label}
            onClick={() => set({ colors: c })}
            className={cx('flex h-8 flex-1 items-center justify-center gap-1 rounded-full border transition-colors', style.colors === c ? 'border-ink' : 'border-line hover:border-line-strong')}
          >
            <span className="h-3.5 w-1.5 rounded-sm" style={{ background: COLORS[c].up }} />
            <span className="h-2.5 w-1.5 rounded-sm" style={{ background: COLORS[c].down }} />
          </button>
        ))}
      </div>
    </div>
  );
}
