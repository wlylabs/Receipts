'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ClipboardPaste, X } from 'lucide-react';
import { cleanAddress } from '../lib/receipts';
import { MODES, routeFor, type PasteMode } from '../lib/paste';
import { readClipboard } from '../lib/clipboard';
import { KEYS } from '../lib/game';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { useStored } from '../hooks/useStored';

/**
 * The paste box. It takes what its tab says, a token CA or a wallet, and nothing is guessed: a
 * token DexScreener hasn't listed yet looks just like a wallet. The pick is remembered, and the
 * big box and the bar's small one share it.
 */
export function Omnibox({ size = 'lg', onGo }: { size?: 'lg' | 'sm'; onGo?: () => void }) {
  const router = useRouter();
  const [stored, setMode] = useStored<PasteMode>(KEYS.pasteMode, 'token');
  const mode: PasteMode = stored === 'wallet' ? 'wallet' : 'token';
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const m = MODES[mode];

  const go = (raw: string) => {
    const r = routeFor(mode, raw);
    if ('error' in r) {
      setError(r.error);
      input.current?.focus();
      return;
    }
    setError(null);
    router.push(r.to);
    onGo?.();
  };

  const pick = (next: PasteMode) => {
    setMode(next);
    setError(null);
    input.current?.focus();
  };

  const paste = async () => {
    const text = await readClipboard();
    if (text === null) {
      input.current?.focus();
      toast('Your browser kept the clipboard to itself. Long-press the box to paste.');
      return;
    }
    setValue(cleanAddress(text));
    go(text);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(value);
  };

  const lg = size === 'lg';
  const id = lg ? 'omnibox' : 'omnibox-sm';
  return (
    <form onSubmit={submit} noValidate role="search">
      {lg && (
        <div role="radiogroup" aria-label="What you’re pasting" className="mb-3 inline-flex rounded-full border border-line bg-subtle/70 p-0.5 text-[13px]">
          {(Object.keys(MODES) as PasteMode[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={mode === k}
              onClick={() => pick(k)}
              className={cx('h-8 rounded-full px-4 font-medium transition-all duration-200', mode === k ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12),inset_0_0_0_1px_var(--line)]' : 'text-muted hover:text-ink')}
            >
              {MODES[k].tab}
            </button>
          ))}
        </div>
      )}
      <label htmlFor={id} className="sr-only">
        {m.tab}
      </label>
      <div className={cx('field pr-1.5', lg ? 'h-16 pl-4 shadow-[var(--shadow),var(--edge)]' : 'h-10 pl-1', error && 'border-neg')}>
        {!lg && (
          // the small box flips between the two with one tap
          <button
            type="button"
            onClick={() => pick(mode === 'wallet' ? 'token' : 'wallet')}
            className="chip h-7 shrink-0 cursor-pointer font-semibold text-ink hover:border-line-strong"
            aria-label={`Pasting a ${m.tab.toLowerCase()}. Switch to ${mode === 'wallet' ? 'token CA' : 'wallet'}`}
            title={`Switch to ${mode === 'wallet' ? 'Token CA' : 'Wallet'}`}
          >
            {m.short}
          </button>
        )}
        <input
          ref={input}
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (!text) return;
            e.preventDefault();
            setValue(cleanAddress(text));
            go(text);
          }}
          placeholder={lg ? m.placeholder : 'Paste…'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cx('mono min-w-0 flex-1 bg-transparent px-2 outline-none focus-visible:outline-none placeholder:font-sans placeholder:text-faint', lg ? 'text-[15px]' : 'text-[13px]')}
        />
        {value ? (
          <>
            <button type="button" onClick={() => setValue('')} className="grid size-9 shrink-0 place-items-center rounded-md text-faint hover:text-ink" aria-label="Clear">
              <X className="size-4" />
            </button>
            <button type="submit" className={cx('btn btn-primary min-h-0 shrink-0', lg ? 'h-12 px-5' : 'h-8 px-2.5')}>
              {lg && <span className="hidden sm:inline">Pull receipts</span>}
              <ArrowRight className="size-4" aria-hidden />
              <span className="sr-only">Go</span>
            </button>
          </>
        ) : (
          <button type="button" onClick={paste} className={cx('btn min-h-0 shrink-0', lg ? 'btn-primary h-12 px-5' : 'btn-ink h-8 px-2.5 text-[12.5px]')}>
            <ClipboardPaste className="size-4" aria-hidden />
            Paste
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-[13px] text-neg" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
