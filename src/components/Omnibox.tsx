'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ClipboardPaste, History, LineChart, Loader2, Search, X } from 'lucide-react';
import { cleanAddress, isAddress, isWallet } from '../lib/receipts';
import { useStored } from '../hooks/useStored';
import { KEYS } from '../lib/game';
import { readClipboard } from '../lib/clipboard';
import { ROUTES } from '../lib/site';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import type { ApiError, Resolved } from '../lib/types';

export type PasteKind = 'token' | 'wallet';

const COPY: Record<PasteKind, { label: string; title: string; body: string; placeholder: string; empty: string; bad: string }> = {
  token: {
    label: 'Token CA',
    title: 'Token CA',
    body: 'See the market right now, every candle, and its top 3 gainers and losers, ready to copy or turn into a video.',
    placeholder: 'Paste a token CA',
    empty: 'Paste a token CA.',
    bad: 'That doesn’t look like a Solana or 0x token address.',
  },
  wallet: {
    label: 'Wallet',
    title: 'Wallet address',
    body: 'Pick a token they traded, watch their trades replay on the chart, then turn it into a video.',
    placeholder: 'Paste a wallet address',
    empty: 'Paste a wallet address.',
    bad: 'That doesn’t look like a Solana or 0x wallet address.',
  },
};

const ICON: Record<PasteKind, React.ReactNode> = { token: <LineChart className="size-4" />, wallet: <History className="size-4" /> };

/**
 * The paste box, with the choice of what is pasted: a token CA opens its top traders, a wallet
 * opens the replay of its trades. People say which; a wallet is still asked of DexScreener, so a
 * token pasted there is caught instead of opening as an empty wallet.
 */
export function Omnibox({ autoFocus = false, size = 'lg', initial = '', onGo }: { autoFocus?: boolean; size?: 'lg' | 'sm'; initial?: string; onGo?: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useStored<PasteKind>(KEYS.pasteKind, 'token');
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<{ text: string; switchTo?: PasteKind } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const copy = COPY[kind];

  const pick = (k: PasteKind) => {
    setKind(k);
    setError(null);
    input.current?.focus();
  };

  const go = async (raw: string, as: PasteKind = kind) => {
    const a = cleanAddress(raw);
    if (!a) {
      setError({ text: COPY[as].empty });
      input.current?.focus();
      return;
    }
    if (as === 'token' ? !isAddress(a) : !isWallet(a)) {
      setError({ text: COPY[as].bad });
      input.current?.focus();
      return;
    }
    setError(null);
    if (as === 'token') {
      // the token page says itself when there is no pair or its chain isn't played
      router.push(ROUTES.token(a));
      onGo?.();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/resolve/${encodeURIComponent(a)}/`);
      const body = (await res.json()) as Resolved | ApiError;
      if (('kind' in body && body.kind === 'token') || ('code' in body && body.code === 'unsupported')) {
        setBusy(false);
        setError({ text: 'That’s a token CA, not a wallet.', switchTo: 'token' });
        return;
      }
    } catch {
      // the check is a courtesy: if it fails, open the wallet as asked
    }
    router.push(ROUTES.wallet(a));
    // the page stays; it shows the result under the box
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

  const switchAndGo = (to: PasteKind) => {
    setKind(to);
    void go(value, to);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void go(value);
  };

  const lg = size === 'lg';
  return (
    <form onSubmit={submit} noValidate>
      {lg ? (
        // on the home page the choice is the two cards that say what each one does
        <div role="radiogroup" aria-label="What are you pasting?" className="mb-3 grid gap-2 sm:grid-cols-2">
          {(Object.keys(COPY) as PasteKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => pick(k)}
              className={cx(
                'flex gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                kind === k ? 'border-ink bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'border-line hover:bg-hover',
              )}
            >
              <span className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', kind === k ? 'bg-ink text-on-ink' : 'bg-subtle text-ink-2')} aria-hidden>
                {ICON[k]}
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold">{COPY[k].title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{COPY[k].body}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div role="radiogroup" aria-label="What are you pasting?" className="mb-2 inline-flex rounded-[10px] bg-subtle p-0.5 text-[13px]">
          {(Object.keys(COPY) as PasteKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => pick(k)}
              className={cx('min-h-9 rounded-lg px-3.5 font-medium transition-colors', kind === k ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink')}
            >
              {COPY[k].label}
            </button>
          ))}
        </div>
      )}
      <label htmlFor="omnibox" className="sr-only">
        {copy.label}
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
          placeholder={copy.placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={!!error}
          aria-describedby={error ? 'omnibox-error' : undefined}
          className={cx('num min-w-0 flex-1 bg-transparent px-1.5 outline-none focus-visible:outline-none placeholder:text-faint', lg ? 'text-[15px]' : 'text-[14px]')}
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
          {error.text}
          {error.switchTo && (
            <>
              {' '}
              <button type="button" onClick={() => switchAndGo(error.switchTo!)} className="font-medium underline underline-offset-2">
                Open it as a token
              </button>
            </>
          )}
        </p>
      )}
    </form>
  );
}
