'use client';

import { Flame } from 'lucide-react';
import { useStored } from '../hooks/useStored';
import { KEYS, NO_STREAK, toneOf, type Recent, type Streak } from '../lib/game';
import { PAPER_KEY, paperPnl, type PaperTrade } from '../lib/paper';
import { day, pct, short, usd } from '../lib/format';
import { ROUTES } from '../lib/site';
import { TokenRow } from './TokenRow';

/** This browser's paper trades, call streak and last wallets. */
export function PaperBook() {
  const [paper] = useStored<PaperTrade[]>(PAPER_KEY, []);
  const [streak] = useStored<Streak>(KEYS.streak, NO_STREAK);
  const [recent] = useStored<Recent[]>(KEYS.recent, []);
  const wallets = recent.filter((r) => r.kind === 'trader' || r.kind === 'wallet').slice(0, 5);
  const closed = paper.filter((p) => p.exitPrice !== null);
  const total = closed.reduce((a, p) => a + (paperPnl(p) ?? 0), 0);

  return (
    <section id="book" aria-labelledby="book-title" className="panel scroll-mt-20 overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line px-3 py-2.5 sm:px-4">
        <h2 id="book-title" className="text-[13.5px] font-semibold">
          My paper trades
        </h2>
        {closed.length > 0 && <span className={`num text-[13px] font-medium ${total >= 0 ? 'text-pos' : 'text-neg'}`}>{usd(total, { signed: true })} closed</span>}
      </div>
      {paper.length === 0 ? (
        <p className="px-4 py-6 text-[13px] leading-relaxed text-muted">Nothing yet. Paste a token CA and place a paper trade on its real chart — it lands here, kept in this browser.</p>
      ) : (
        <ul className="max-h-[340px] divide-y divide-line overflow-y-auto">
          {paper.map((p) => {
            const pnl = paperPnl(p);
            return (
              <li key={p.id}>
                <TokenRow
                  href={ROUTES.token(p.address)}
                  image={p.image}
                  symbol={p.symbol}
                  sub={`${usd(p.usd)} · bought ${day(p.entryTs)}${p.exitTs ? '' : ' · open'}`}
                  right={pnl === null ? 'Open' : usd(pnl, { signed: true })}
                  rightSub={pnl === null ? undefined : pct(pnl / p.usd, { signed: true })}
                  rightTone={pnl === null ? null : toneOf(pnl)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {(streak.calls > 0 || wallets.length > 0) && (
        <div className="border-t border-line px-3 py-3 sm:px-4">
          {streak.calls > 0 && (
            <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
              <Flame className="size-3.5 text-orange-500" aria-hidden />
              Call streak <b className="num">{streak.current}</b> · best <b className="num">{streak.best}</b> · {streak.right}/{streak.calls} right
            </p>
          )}
          {wallets.length > 0 && (
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
              {wallets.map((w) => (
                <a key={`${w.address}:${w.ca}`} href={w.ca ? ROUTES.trader(w.address, w.ca) : ROUTES.wallet(w.address)} className="btn btn-quiet h-8 min-h-0 shrink-0 px-2.5 text-[12.5px]">
                  {w.label || short(w.address)}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
