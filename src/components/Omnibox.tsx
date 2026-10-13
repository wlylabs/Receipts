'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ClipboardPaste, Loader2, ScanLine, X } from 'lucide-react';
import { cleanAddress, isAddress, isWallet } from '../lib/receipts';
import { readClipboard } from '../lib/clipboard';
import { ROUTES } from '../lib/site';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import type { ApiError, Resolved } from '../lib/types';

/** What a pasted string looks like before anything is asked of the network. */
function family(a: string): string | null {
  if (!a) return null;
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return 'EVM address';
  if (isWallet(a)) return 'Solana address';
  if (isAddress(a)) return 'Pool ID';
  return null;
}

/**
 * The paste box. One field for anything: it asks DexScreener whether the address is a token (it
 * has a pair) or a wallet and opens the right page, so nobody has to say which first.
 */
export function Omnibox({ size = 'lg', initial = '', onGo }: { size?: 'lg' | 'sm'; initial?: string; onGo?: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
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
    // a pool ID is never a wallet
    if (!isWallet(a)) {
      router.push(ROUTES.token(a));
      onGo?.();
      return;
    }
    setBusy(true);
    let to = ROUTES.token(a);
    try {
      const res = await fetch(`/api/resolve/${encodeURIComponent(a)}/`);
      const body = (await res.json()) as Resolved | ApiError;
      if ('kind' in body) to = body.kind === 'wallet' ? ROUTES.wallet(a) : ROUTES.token(body.address);
      else if (body.code === 'not-found' || body.code === 'unsupported' || body.code === 'invalid') {
        setBusy(false);
        setError(body.error);
        return;
      }
      // busy or upstream down: the token page says itself when there is no pair
    } catch {
      // offline or the check failed: open it as a token, which explains itself
    }
    router.push(to);
    setBusy(false);
    onGo?.();
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
  const kind = family(cleanAddress(value));
  return (
    <form onSubmit={submit} noValidate role="search">
      <label htmlFor={lg ? 'omnibox' : 'omnibox-sm'} className="sr-only">
        Token CA or wallet address
      </label>
      <div className={cx('field pr-1.5', lg ? 'h-16 pl-4 shadow-[0_3px_0_var(--key-field)]' : 'h-10 pl-3', error && 'border-neg')}>
        <ScanLine className={cx('shrink-0 text-faint', lg ? 'size-5' : 'size-4')} aria-hidden />
        <input
          ref={input}
          id={lg ? 'omnibox' : 'omnibox-sm'}
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
          placeholder={lg ? 'Paste a token CA or a wallet…' : 'Paste a CA or wallet'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={!!error}
          aria-describedby={error ? 'omnibox-error' : undefined}
          className={cx('mono min-w-0 flex-1 bg-transparent px-2 outline-none focus-visible:outline-none placeholder:font-sans placeholder:text-faint', lg ? 'text-[15px]' : 'text-[13px]')}
        />
        {lg && kind && !busy && <span className="chip hidden sm:inline-flex">{kind}</span>}
        {busy ? (
          <span className={cx('flex items-center gap-2 px-3 text-muted', lg ? 'text-[13px]' : 'text-[12px]')}>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {lg && <span className="hidden sm:inline">Reading…</span>}
            <span className="sr-only">Checking the address</span>
          </span>
        ) : value ? (
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
        <p id="omnibox-error" className="mt-2 text-[13px] text-neg" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
