'use client';

import { useEffect, useRef, useState } from 'react';
import { CandlestickChart } from 'lucide-react';
import { useChartStyle } from '../hooks/useChartStyle';
import { COLORS, KINDS, SWATCHES, type CandleColors, type ChartStyle } from '../lib/chartStyle';
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
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Chart style" title="Chart style" className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink">
        <CandlestickChart className="size-4" aria-hidden />
      </button>
      {open && (
        <div className="panel fade-in absolute right-0 top-full z-20 mt-1.5 w-72 p-3">
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
      <div role="radiogroup" aria-label="Chart type" className="flex rounded-full bg-subtle p-0.5 text-[12.5px]">
        {(Object.keys(KINDS) as ChartStyle['kind'][]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={style.kind === k}
            onClick={() => set({ kind: k })}
            className={cx('h-8 flex-1 whitespace-nowrap rounded-full px-2.5 font-medium transition-all', style.kind === k ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-muted hover:text-ink')}
          >
            {KINDS[k]}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Candle colours" className="flex gap-1.5">
        {(Object.keys(COLORS) as CandleColors[]).map((c) => (
          <Chip key={c} on={style.colors === c} label={COLORS[c].label} up={COLORS[c].up} down={COLORS[c].down} pick={() => set({ colors: c })} />
        ))}
        <Chip on={style.colors === 'custom'} label="Your own" up={style.up} down={style.down} pick={() => set({ colors: 'custom' })} />
      </div>
      {style.colors === 'custom' && (
        <div className="fade-in space-y-1.5">
          <Swatches name="Buy" value={style.up} pick={(up) => set({ up })} />
          <Swatches name="Sell" value={style.down} pick={(down) => set({ down })} />
        </div>
      )}
    </div>
  );
}

function Chip({ on, label, up, down, pick }: { on: boolean; label: string; up: string; down: string; pick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={pick}
      className={cx('flex h-8 flex-1 items-center justify-center gap-1 rounded-full border transition-colors', on ? 'border-ink' : 'border-line hover:border-line-strong')}
    >
      <span className="h-3.5 w-1.5 rounded-sm" style={{ background: up }} />
      <span className="h-2.5 w-1.5 rounded-sm" style={{ background: down }} />
    </button>
  );
}

/** One side's colour: a few ready ones, and the system picker for any other. */
function Swatches({ name, value, pick }: { name: string; value: string; pick: (c: string) => void }) {
  const other = !SWATCHES.includes(value);
  return (
    <div role="radiogroup" aria-label={`${name} candle colour`} className="flex items-center gap-1">
      <span className="w-9 shrink-0 text-[12px] font-medium text-muted">{name}</span>
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => pick(c)}
          className={cx('size-6 shrink-0 rounded-full border-2 transition-transform active:scale-90', value === c ? 'border-ink' : 'border-transparent')}
        >
          <span className="block size-full rounded-full border-2 border-surface" style={{ background: c }} />
        </button>
      ))}
      <label
        title="Any colour"
        className={cx('relative size-6 shrink-0 cursor-pointer rounded-full border-2', other ? 'border-ink' : 'border-transparent')}
      >
        <span
          className="block size-full rounded-full border-2 border-surface"
          style={{ background: other ? value : 'conic-gradient(#e5322d, #eab308, #12a150, #26a69a, #2f80ed, #8b5cf6, #ec4899, #e5322d)' }}
        />
        <input type="color" value={value} onChange={(e) => pick(e.target.value)} aria-label={`Any ${name.toLowerCase()} colour`} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
    </div>
  );
}
