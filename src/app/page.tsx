import { LineChart, ReceiptText } from 'lucide-react';
import { Omnibox } from '../components/Omnibox';
import { Trending } from '../components/Trending';
import { PaperBook } from '../components/PaperBook';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="mx-auto max-w-2xl pb-10 pt-12 text-center sm:pt-20" aria-labelledby="hero">
        <h1 id="hero" className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[52px]">
          Paper-trade any token.
          <br />
          <span className="text-muted">Pull anyone’s receipts.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-ink-2 sm:text-base">
          Real charts, real wallets, pretend money. Solana, Ethereum, Base, BNB, Arbitrum, Polygon, Avalanche and Optimism.
        </p>
        <div id="paste" className="mt-8 scroll-mt-24 text-left">
          <Omnibox />
        </div>
        <div className="mt-4 grid gap-2 text-left sm:grid-cols-2">
          <Mode icon={<LineChart className="size-4" />} title="Token CA" body="Buy at any candle since launch, sell later or hold to now, and rank against its real traders." />
          <Mode icon={<ReceiptText className="size-4" />} title="Wallet address" body="Pick a token they traded, call it profit or rekt, then watch their receipt print." />
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Trending />
        <PaperBook />
      </div>
    </div>
  );
}

function Mode({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-line px-3.5 py-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-subtle text-ink-2">{icon}</span>
      <div>
        <p className="text-[13.5px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{body}</p>
      </div>
    </div>
  );
}
