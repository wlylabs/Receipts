'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ClipboardPaste, Loader2, Search, X } from 'lucide-react';
import { cleanAddress, isAddress } from '../lib/receipts';
import { readClipboard } from '../lib/clipboard';
import { ROUTES } from '../lib/site';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import type { ApiError, Resolved } from '../lib/types';

/**
 * One box for both games: a token CA opens the paper trade, a wallet opens its receipts. What
 * was pasted is asked of DexScreener, so nobody has to say which it is.
 */
export function Omnibox({ autoFocus = false, size = 'lg' }: { autoFocus?: boolean; size?: 'lg' | 'sm' }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const go = async (raw: string) => {
    const a = cleanAddress(raw);
    if (!a) {
      setError('Paste a token CA or a wallet address.');
      input.current?.focus();
      return;
    }
    if (!isAddress(a)) {
      setError('That doesn’t look like a Solana or 0x address.');
      input.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/resolve/${encodeURIComponent(a)}/`);
      const body = (await res.json()) as Resolved | ApiError;
      if (!res.ok || !('kind' in body)) throw new Error('error' in body ? body.error : 'resolve');
      router.push(body.kind === 'token' ? ROUTES.token(body.address) : ROUTES.wallet(body.address));
    } catch (e) {
      setBusy(false);
      setError((e as Error).message === 'resolve' ? 'Couldn’t check that address. Try again.' : (e as Error).message);
    }
  };

  const paste = async () => {
    const text = await readClipboard();
    if (text === null) {
      input.current?.focus();
      toast('Your browser kept the clipboard to itself. Long-press the box to paste.');
      return;
    }
    setValue(cleanAddress(text));
    void go(text);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void go(value);
  };

  const lg = size === 'lg';
  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="omnibox" className="sr-only">
        Token CA or wallet address
      </label>
      <div className={cx('field pl-3.5 pr-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', lg ? 'h-14 rounded-[14px]' : 'h-11', error && 'border-neg')}>
        <Search className="size-4 shrink-0 text-faint" aria-hidden />
        <input
          ref={input}
          id="omnibox"
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
            void go(text);
          }}
          placeholder="Paste a token CA or a wallet address"
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={!!error}
          aria-describedby={error ? 'omnibox-error' : undefined}
          className={cx('num min-w-0 flex-1 bg-transparent px-1.5 outline-none placeholder:text-faint', lg ? 'text-[15px]' : 'text-[14px]')}
        />
        {busy ? (
          <span className="grid size-10 place-items-center text-muted">
            <Loader2 className="size-4 animate-spin" aria-label="Checking" />
          </span>
        ) : value ? (
          <>
            <button type="button" onClick={() => setValue('')} className="grid size-9 place-items-center rounded-lg text-faint hover:text-ink" aria-label="Clear">
              <X className="size-4" />
            </button>
            <button type="submit" className={cx('btn btn-primary min-h-0 px-3', lg ? 'h-10' : 'h-8')} aria-label="Go">
              <ArrowRight className="size-4" />
            </button>
          </>
        ) : (
          <button type="button" onClick={paste} className={cx('btn btn-primary min-h-0 px-3', lg ? 'h-10' : 'h-8')}>
            <ClipboardPaste className="size-4" aria-hidden />
            Paste
          </button>
        )}
      </div>
      {error && (
        <p id="omnibox-error" className="mt-2 text-[13px] text-neg" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
