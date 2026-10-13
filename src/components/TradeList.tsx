'use client';

import { ArrowUpRight, Download } from 'lucide-react';
import { CHAINS } from '../lib/chains';
import { saveFile } from '../lib/clipboard';
import { compact, dateTime, price, usd } from '../lib/format';
import { toast } from '../lib/toast';
import { tradesCsv } from '../lib/traderVideo';
import type { TraderReceipts } from '../lib/types';
import { cx } from '../lib/cx';

/** Every trade the receipt is made of, newest first, each linked to the chain, and the lot as a CSV. */
export function TradeList({ r }: { r: TraderReceipts }) {
  const chain = CHAINS[r.token.chain];
  const rows = [...r.trades].reverse();
  const download = async () => {
    const name = `${r.owner.slice(0, 6)}-${r.token.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'token'}-trades.csv`;
    const res = await saveFile(new File([tradesCsv(r)], name, { type: 'text/csv' })).catch(() => null);
    if (res === 'saved') toast('Trades saved.');
  };
  return (
    <section className="panel overflow-hidden" aria-label="Trades">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <h2 className="label">Every trade · {r.trades.length}</h2>
        <button type="button" onClick={download} className="btn btn-quiet h-8 min-h-0 px-2.5 text-[12.5px]">
          <Download className="size-3.5" aria-hidden /> CSV
        </button>
      </div>
      <ul className="max-h-96 overflow-y-auto">
        {rows.map(([ts, side, tokens, u, pr, tx, kind, priced, fee]) => {
          const gift = kind === 'transfer';
          return (
            <li key={`${tx}:${side}`} className="flex items-center gap-3 border-b border-dashed border-line px-4 py-2.5 text-[13px] last:border-0 sm:px-5">
              <span className={cx('mono w-[4.5rem] shrink-0 rounded px-1.5 py-0.5 text-center text-[10.5px] font-bold uppercase tracking-wide', gift ? 'bg-subtle text-muted' : side === 'buy' ? 'bg-pos-wash text-pos' : 'bg-neg-wash text-neg')}>{gift ? (side === 'buy' ? 'Received' : 'Sent') : side === 'buy' ? 'Buy' : 'Sell'}</span>
              <span className="min-w-0 flex-1">
                <span className="num block truncate">
                  {compact(tokens)} {r.token.symbol} · {usd(u)}
                </span>
                <span className="mono block truncate text-[11px] text-muted">
                  {dateTime(ts)} · {price(pr)}
                  {priced === 'candle' ? ' · priced from the chart' : ''}
                  {fee ? ` · fee ${usd(fee)}` : ''}
                </span>
              </span>
              {chain && (
                <a href={chain.tx(tx)} target="_blank" rel="noreferrer" className="grid size-8 shrink-0 place-items-center rounded-md text-faint hover:bg-hover hover:text-ink" aria-label="Open the transaction in the explorer">
                  <ArrowUpRight className="size-4" aria-hidden />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
