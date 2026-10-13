'use client';

import Link from 'next/link';
import { History, LineChart, Wallet } from 'lucide-react';
import { useStored } from '../hooks/useStored';
import { KEYS, type Recent } from '../lib/game';
import { ROUTES } from '../lib/site';
import { cx } from '../lib/cx';

export const hrefOf = (r: Recent) => (r.kind === 'token' ? ROUTES.token(r.address) : r.kind === 'trader' && r.ca ? ROUTES.trader(r.address, r.ca) : ROUTES.wallet(r.address));

const ICONS = { token: LineChart, wallet: Wallet, trader: History };
const KINDS = { token: 'Token', wallet: 'Wallet', trader: 'Replay' };

/** What this browser looked up last, newest first. */
export function RecentList({ limit, compact = false, onPick, hideEmpty = false }: { limit?: number; compact?: boolean; onPick?: () => void; hideEmpty?: boolean }) {
  const [recent] = useStored<Recent[]>(KEYS.recent, []);
  const list = limit ? recent.slice(0, limit) : recent;

  if (!list.length) {
    if (hideEmpty) return null;
    return <p className={cx('text-muted', compact ? 'px-3 text-[12.5px]' : 'text-[13.5px]')}>Nothing yet.</p>;
  }
  return (
    <ul className={cx(compact ? 'space-y-0.5' : 'divide-y divide-line overflow-hidden rounded-[14px] border border-line')}>
      {list.map((r) => {
        const Icon = ICONS[r.kind];
        return (
          <li key={`${r.kind}:${r.address}:${r.ca ?? ''}`}>
            <Link
              href={hrefOf(r)}
              onClick={onPick}
              className={cx('flex items-center gap-2.5 text-ink-2 transition-colors hover:bg-hover hover:text-ink', compact ? 'rounded-lg px-3 py-1.5 text-[13px]' : 'px-4 py-3 text-[14px]')}
            >
              <Icon className="size-4 shrink-0 text-faint" aria-hidden />
              <span className="num min-w-0 flex-1 truncate">{r.label}</span>
              {!compact && <span className="text-[12px] text-muted">{KINDS[r.kind]}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
