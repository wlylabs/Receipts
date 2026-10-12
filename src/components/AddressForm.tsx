'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ClipboardPaste, Coins, Dices, Loader2, Wallet, X } from 'lucide-react';
import { ADDRESS_RE, cleanAddress } from '../lib/receipts';
import { readClipboard } from '../lib/clipboard';
import { ROUTES } from '../lib/site';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';

export type Mode = 'trader' | 'token';

const COPY: Record<Mode, { tab: string; label: string; placeholder: string; go: string; hint: string }> = {
  trader: {
    tab: 'Trader address',
    label: 'Paste a trader’s wallet address',
    placeholder: 'Wallet address, e.g. 2eZJ…xQr',
    go: 'Pull receipts',
    hint: 'Every Bordrless trade the wallet made, priced to the lamport.',
  },
  token: {
    tab: 'Token CA',
    label: 'Paste a token contract address (CA)',
    placeholder: 'Contract address, e.g. 5xpz…spwi',
    go: 'Ape in',
    hint: 'Pick an entry and an exit on the real chart and see where you’d rank.',
  },
};

export function AddressForm({ initial = 'trader', autoFocus = false }: { initial?: Mode; autoFocus?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initial);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'go' | 'random' | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const c = COPY[mode];

  const go = (raw: string, m: Mode = mode) => {
    const a = cleanAddress(raw);
    if (!a) {
      setError('Paste an address first.');
      input.current?.focus();
      return;
    }
    if (!ADDRESS_RE.test(a)) {
      setError('That doesn’t look like a Solana address (32–44 base58 characters).');
      input.current?.focus();
      return;
    }
    setError(null);
    setBusy('go');
    router.push(m === 'trader' ? ROUTES.trader(a) : ROUTES.token(a));
  };

  // a bordrless.app token link is a CA whichever tab is open
  const modeFor = (raw: string): Mode => (/\/token\//.test(raw) ? 'token' : /\/(portfolio|account|address)\//.test(raw) ? 'trader' : mode);

  const paste = async () => {
    const text = await readClipboard();
    if (text === null) {
      input.current?.focus();
      toast('Your browser kept the clipboard to itself. Long-press the box to paste.');
      return;
    }
    const m = modeFor(text);
    setMode(m);
    setValue(cleanAddress(text));
    go(text, m);
  };

  const random = async () => {
    setBusy('random');
    try {
      const res = await fetch('/api/random', { cache: 'no-store' });
      const body = (await res.json()) as { address?: string; error?: string };
      if (!res.ok || !body.address) throw new Error(body.error ?? 'random');
      router.push(ROUTES.trader(body.address));
    } catch {
      setBusy(null);
      toast('Couldn’t find a random trader right now. Try again.');
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(value);
  };

  return (
    <form onSubmit={submit} className="card overflow-hidden" noValidate>
      <div role="tablist" aria-label="What to paste" className="grid grid-cols-2 border-b border-line bg-surface-2 p-1.5">
        {(['trader', 'token'] as Mode[]).map((m) => {
          const on = m === mode;
          const Icon = m === 'trader' ? Wallet : Coins;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${id}-panel`}
              onClick={() => {
                setMode(m);
                setError(null);
                input.current?.focus();
              }}
              className={cx(
                'flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-2 text-sm font-semibold transition-colors',
                on ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {COPY[m].tab}
            </button>
          );
        })}
      </div>

      <div id={`${id}-panel`} role="tabpanel" className="space-y-3 p-4 sm:p-5">
        <label htmlFor={`${id}-input`} className="block text-[15px] font-semibold">
          {c.label}
        </label>
        <div
          className={cx(
            'flex items-center gap-1 rounded-[14px] border bg-surface-2 pl-3.5 pr-1.5 transition-colors focus-within:border-ink',
            error ? 'border-neg' : 'border-line',
          )}
        >
          <input
            ref={input}
            id={`${id}-input`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              if (!text) return;
              e.preventDefault();
              const m = modeFor(text);
              setMode(m);
              setValue(cleanAddress(text));
              if (ADDRESS_RE.test(cleanAddress(text))) go(text, m);
            }}
            placeholder={c.placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            aria-invalid={!!error}
            aria-describedby={`${id}-hint`}
            className="num h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:font-sans placeholder:text-muted"
          />
          {value ? (
            <button type="button" onClick={() => setValue('')} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:text-ink" aria-label="Clear">
              <X className="size-4" />
            </button>
          ) : (
            <button type="button" onClick={paste} className="btn btn-ink h-11 min-h-0 shrink-0 px-3.5 text-sm">
              <ClipboardPaste className="size-4" aria-hidden />
              Paste
            </button>
          )}
        </div>
        <p id={`${id}-hint`} className={cx('text-[13px] leading-snug', error ? 'text-neg' : 'text-muted')} role={error ? 'alert' : undefined}>
          {error ?? c.hint}
        </p>

        <div className={cx('grid gap-2', mode === 'trader' ? 'grid-cols-[1fr_auto]' : 'grid-cols-1')}>
          <button type="submit" disabled={busy !== null} className="btn btn-hi h-13 text-base">
            {busy === 'go' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {c.go}
            {busy !== 'go' && <ArrowRight className="size-5" aria-hidden />}
          </button>
          {mode === 'trader' && (
            <button type="button" onClick={random} disabled={busy !== null} className="btn btn-ghost h-13" title="A random real trader from a busy token">
              {busy === 'random' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Dices className="size-5" aria-hidden />}
              <span className="hidden sm:inline">Random</span>
              <span className="sr-only sm:hidden">Random trader</span>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
