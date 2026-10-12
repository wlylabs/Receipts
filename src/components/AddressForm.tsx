'use client';

import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ClipboardPaste, Coins, Dices, Loader2, Wallet, X } from 'lucide-react';
import { cleanAddress, isAddress, isWallet } from '../lib/receipts';
import { readClipboard } from '../lib/clipboard';
import { ROUTES } from '../lib/site';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';

export type Mode = 'trader' | 'token';

const COPY: Record<Mode, { tab: string; go: string; hint: string }> = {
  trader: {
    tab: 'Trader address',
    go: 'Pull receipts',
    hint: 'Their buys and sells in the token’s latest trades (about the last day), priced in USD.',
  },
  token: {
    tab: 'Token CA',
    go: 'Ape in',
    hint: 'Any token on DexScreener: Solana, Ethereum, Base, BNB, Arbitrum, Polygon, Avalanche, Optimism.',
  },
};

export function AddressForm({ initial = 'token', wallet: initialWallet = '', ca: initialCa = '' }: { initial?: Mode; wallet?: string; ca?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initial);
  const [wallet, setWallet] = useState(initialWallet);
  const [ca, setCa] = useState(initialCa);
  const [error, setError] = useState<{ field: 'wallet' | 'ca'; text: string } | null>(null);
  const [busy, setBusy] = useState<'go' | 'random' | null>(null);
  const walletRef = useRef<HTMLInputElement>(null);
  const caRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const c = COPY[mode];

  const go = (w = wallet, t = ca, m = mode) => {
    const token = cleanAddress(t);
    const owner = cleanAddress(w);
    if (m === 'trader' && !isWallet(owner)) {
      setError({ field: 'wallet', text: owner ? 'That doesn’t look like a wallet address (Solana or 0x…).' : 'Paste the trader’s wallet first.' });
      walletRef.current?.focus();
      return;
    }
    if (!isAddress(token)) {
      setError({ field: 'ca', text: token ? 'That doesn’t look like a token address (Solana or 0x…).' : m === 'trader' ? 'Paste the token they traded too.' : 'Paste a token CA first.' });
      caRef.current?.focus();
      return;
    }
    setError(null);
    setBusy('go');
    router.push(m === 'trader' ? ROUTES.trader(owner, token) : ROUTES.token(token));
  };

  const fill = (field: 'wallet' | 'ca', text: string) => {
    const v = cleanAddress(text);
    if (field === 'wallet') setWallet(v);
    else setCa(v);
    if (error?.field === field) setError(null);
    // a full form goes on its own
    if (mode === 'token' && field === 'ca' && isAddress(v)) go(wallet, v, 'token');
    if (mode === 'trader' && field === 'wallet' && isWallet(v) && isAddress(cleanAddress(ca))) go(v, ca, 'trader');
    if (mode === 'trader' && field === 'ca' && isAddress(v) && isWallet(cleanAddress(wallet))) go(wallet, v, 'trader');
    if (mode === 'trader' && field === 'wallet' && isWallet(v) && !ca) caRef.current?.focus();
  };

  const paste = async (field: 'wallet' | 'ca') => {
    const text = await readClipboard();
    if (text === null) {
      (field === 'wallet' ? walletRef : caRef).current?.focus();
      toast('Your browser kept the clipboard to itself. Long-press the box to paste.');
      return;
    }
    fill(field, text);
  };

  const random = async () => {
    setBusy('random');
    try {
      const res = await fetch('/api/random', { cache: 'no-store' });
      const body = (await res.json()) as { address?: string; ca?: string; error?: string };
      if (!res.ok || !body.address || !body.ca) throw new Error(body.error ?? 'random');
      router.push(ROUTES.trader(body.address, body.ca));
    } catch {
      setBusy(null);
      toast('Couldn’t find a random trader right now. Try again.');
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    go();
  };

  return (
    <form onSubmit={submit} className="card overflow-hidden" noValidate>
      <div role="tablist" aria-label="What to paste" className="grid grid-cols-2 border-b border-line bg-surface-2 p-1.5">
        {(['token', 'trader'] as Mode[]).map((m) => {
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

      <div id={`${id}-panel`} role="tabpanel" className="space-y-4 p-4 sm:p-5">
        {mode === 'trader' && (
          <Field
            id={`${id}-wallet`}
            label="Trader’s wallet address"
            placeholder="Wallet, e.g. 7xKX…AsU or 0x…"
            value={wallet}
            onChange={setWallet}
            onPaste={(t) => fill('wallet', t)}
            onPasteClick={() => paste('wallet')}
            error={error?.field === 'wallet' ? error.text : null}
            inputRef={walletRef}
          />
        )}
        <Field
          id={`${id}-ca`}
          label={mode === 'trader' ? 'Token they traded (CA)' : 'Token contract address (CA)'}
          placeholder="CA or a dexscreener.com link"
          value={ca}
          onChange={setCa}
          onPaste={(t) => fill('ca', t)}
          onPasteClick={() => paste('ca')}
          error={error?.field === 'ca' ? error.text : null}
          inputRef={caRef}
        />
        <p className="text-[13px] leading-snug text-muted">{c.hint}</p>

        <div className={cx('grid gap-2', mode === 'trader' ? 'grid-cols-[1fr_auto]' : 'grid-cols-1')}>
          <button type="submit" disabled={busy !== null} className="btn btn-hi h-13 text-base">
            {busy === 'go' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {c.go}
            {busy !== 'go' && <ArrowRight className="size-5" aria-hidden />}
          </button>
          {mode === 'trader' && (
            <button type="button" onClick={random} disabled={busy !== null} className="btn btn-ghost h-13" title="A random real trader from a trending token">
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

function Field({
  id,
  label,
  placeholder,
  value,
  onChange,
  onPaste,
  onPasteClick,
  error,
  inputRef,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onPaste: (text: string) => void;
  onPasteClick: () => void;
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] font-semibold">
        {label}
      </label>
      <div className={cx('mt-2 flex items-center gap-1 rounded-[14px] border bg-surface-2 pl-3.5 pr-1.5 transition-colors focus-within:border-ink', error ? 'border-neg' : 'border-line')}>
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (!text) return;
            e.preventDefault();
            onPaste(text);
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className="num h-13 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:font-sans placeholder:text-muted"
        />
        {value ? (
          <button type="button" onClick={() => onChange('')} className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:text-ink" aria-label={`Clear ${label}`}>
            <X className="size-4" />
          </button>
        ) : (
          <button type="button" onClick={onPasteClick} className="btn btn-ink h-10 min-h-0 shrink-0 px-3 text-sm">
            <ClipboardPaste className="size-4" aria-hidden />
            Paste
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-[13px] text-neg" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
