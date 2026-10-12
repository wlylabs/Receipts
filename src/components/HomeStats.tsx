'use client';

import Link from 'next/link';
import { Coins, Flame, Target, Wallet } from 'lucide-react';
import { useStored } from '../hooks/useStored';
import { KEYS, NO_STREAK, type Recent, type Streak } from '../lib/game';
import { ROUTES } from '../lib/site';

/** This browser's streak and the last few receipts pulled. */
export function HomeStats() {
  const [streak] = useStored<Streak>(KEYS.streak, NO_STREAK);
  const [recent] = useStored<Recent[]>(KEYS.recent, []);
  if (streak.calls === 0 && recent.length === 0) return null;
  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-[auto_1fr]" aria-label="Your game">
      {streak.calls > 0 && (
        <div className="card grid grid-cols-3 divide-x divide-line p-0 text-center">
          <Stat icon={<Flame className="size-4" />} label="Streak" value={streak.current} />
          <Stat icon={<Target className="size-4" />} label="Best" value={streak.best} />
          <Stat label="Called" value={`${streak.right}/${streak.calls}`} />
        </div>
      )}
      {recent.length > 0 && (
        <div className="card min-w-0 p-3">
          <p className="label px-1 pb-2 text-muted">Recent</p>
          <ul className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {recent.map((r) => (
              <li key={`${r.kind}:${r.address}`} className="shrink-0">
                <Link href={r.kind === 'trader' ? ROUTES.trader(r.address, r.ca ?? '') : ROUTES.token(r.address)} className="btn btn-ghost h-10 min-h-0 px-3 text-sm">
                  {r.kind === 'trader' ? <Wallet className="size-4" aria-hidden /> : <Coins className="size-4" aria-hidden />}
                  <span className="num">{r.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="min-w-24 px-4 py-3">
      <p className="label flex items-center justify-center gap-1 text-muted">
        {icon}
        {label}
      </p>
      <p className="num mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
