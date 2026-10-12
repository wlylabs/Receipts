import { History, LineChart } from 'lucide-react';
import { Omnibox } from '../components/Omnibox';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="mx-auto max-w-2xl pb-10 pt-12 text-center sm:pt-20" aria-labelledby="hero">
        <h1 id="hero" className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[52px]">
          Replay any wallet.
          <br />
          <span className="text-muted">Make the video.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-ink-2 sm:text-base">
          Real charts, real wallets, pretend money. Solana, Ethereum, Base, BNB, Arbitrum, Polygon, Avalanche and Optimism.
        </p>
        <div id="paste" className="mt-8 scroll-mt-24 text-left">
          <Omnibox />
        </div>
        <div className="mt-4 grid gap-2 text-left sm:grid-cols-2">
          <Mode icon={<LineChart className="size-4" />} title="Token CA" body="See its all-time chart and its top 3 gainers and losers, ready to copy or replay as a video." />
          <Mode icon={<History className="size-4" />} title="Wallet address" body="Pick a token they traded, watch their trades replay on the chart, then turn it into a video." />
        </div>
      </section>
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
