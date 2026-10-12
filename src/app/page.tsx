import { Coins, Wallet } from 'lucide-react';
import { AddressForm } from '../components/AddressForm';
import { HomeStats } from '../components/HomeStats';
import { Receipt } from '../components/Receipt';
import type { ReceiptDoc } from '../lib/receiptDoc';

/** The paper on the home page shows the layout, not anyone's numbers. */
const SAMPLE: ReceiptDoc = {
  lines: [
    { t: 'title', text: 'RECEIPTS' },
    { t: 'center', text: 'dexscreener · live trades', muted: true },
    { t: 'dash' },
    { t: 'row', left: 'WALLET', right: 'paste one ↑', muted: true },
    { t: 'row', left: 'TOKEN', right: 'paste a CA ↑', muted: true },
    { t: 'dash' },
    { t: 'item', name: 'BUY  ···', sub: '@ price · time', right: '-$···' },
    { t: 'item', name: 'SELL ···', sub: '@ price · time', right: '+$···' },
    { t: 'dash' },
    { t: 'total', left: 'TOTAL P&L', right: '???', tone: null },
    { t: 'barcode', seed: 'receipts' },
  ],
  stamp: { text: '???', tone: null },
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-start gap-8 pb-6 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12 lg:pt-16" aria-labelledby="hero">
        <div className="min-w-0">
          <p className="label inline-flex items-center gap-2 rounded-full bg-hi px-3 py-1 text-hi-ink">
            <span className="size-1.5 rounded-full bg-hi-ink" aria-hidden /> Live from DexScreener
          </p>
          <h1 id="hero" className="mt-4 text-[44px] font-bold leading-[0.95] tracking-tight sm:text-7xl">
            Pull the <span className="whitespace-nowrap underline decoration-hi decoration-[10px] underline-offset-[6px]">receipts.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-2 sm:text-lg">
            Paste any token CA from DexScreener and ape into its real chart to see where you’d rank among its latest traders. Or paste a trader’s wallet and call it —
            profit or rekt — before their real receipt prints.
          </p>

          <div id="paste" className="mt-7 max-w-xl scroll-mt-24">
            <AddressForm />
          </div>
          <div className="max-w-xl">
            <HomeStats />
          </div>
        </div>

        <div className="hidden lg:block" aria-hidden>
          <div className="rotate-[2.5deg] pt-6">
            <Receipt doc={SAMPLE} animate={false} />
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-20 pt-10" aria-labelledby="how-title">
        <h2 id="how-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          How it plays
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <HowCard
            icon={<Coins className="size-5" />}
            title="Token CA"
            steps={[
              'Paste a token’s contract address or a dexscreener.com link — Solana, Ethereum, Base, BNB, Arbitrum, Polygon, Avalanche or Optimism.',
              'Pick your bag in USD, then drag your entry and exit along the token’s real chart since its pair opened.',
              'Print it: the run replays candle by candle and you get a rank.',
              'See where that P&L would place you among the token’s latest real traders, then open their receipts.',
            ]}
          />
          <HowCard
            icon={<Wallet className="size-5" />}
            title="Trader address"
            steps={[
              'Paste a wallet and the token it traded (or hit Random for a real trader on a trending token).',
              'You see how many buys and sells and how much went in — not how it went. Call it: profit or rekt.',
              'The receipt prints every trade, realized and unrealized P&L, and what selling before the top cost them.',
              'Right calls build your streak. Save the receipt as an image to post it.',
            ]}
          />
        </div>
      </section>
    </div>
  );
}

function HowCard({ icon, title, steps }: { icon: React.ReactNode; title: string; steps: string[] }) {
  return (
    <div className="card p-5 sm:p-6">
      <p className="flex items-center gap-2.5 text-lg font-bold">
        <span className="grid size-9 place-items-center rounded-xl bg-hi text-hi-ink">{icon}</span>
        {title}
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-snug text-ink-2">
            <span className="num grid size-6 shrink-0 place-items-center rounded-md border border-line text-xs font-bold text-ink">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
