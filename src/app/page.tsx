import type { Metadata } from 'next';
import { History, LineChart } from 'lucide-react';
import { Omnibox } from '../components/Omnibox';
import { TokenView } from '../components/TokenView';
import { TraderView } from '../components/TraderView';
import { cleanAddress } from '../lib/receipts';
import { short } from '../lib/format';

type Props = { searchParams: Promise<{ ca?: string | string[]; wallet?: string | string[] }> };

const one = (v: string | string[] | undefined) => cleanAddress(typeof v === 'string' ? v : '');

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = await searchParams;
  const ca = one(q.ca);
  const wallet = one(q.wallet);
  if (wallet) return { title: `Replay ${short(wallet)}`, robots: { index: false } };
  if (ca) return { title: `Top traders of ${short(ca)}`, robots: { index: false } };
  return {};
}

/**
 * The whole app on one page: the paste box, and under it whatever was pasted. A token CA shows its
 * all-time chart and top 3 traders; a wallet shows its tokens, then the replay of one.
 */
export default async function HomePage({ searchParams }: Props) {
  const q = await searchParams;
  const ca = one(q.ca);
  const wallet = one(q.wallet);
  const showing = wallet || ca;

  if (showing) {
    return (
      <>
        <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-6">
          <div id="paste" className="mx-auto max-w-2xl scroll-mt-24">
            <Omnibox key={showing} size="sm" initial={showing} />
          </div>
        </div>
        {wallet ? <TraderView key={`${wallet}:${ca}`} address={wallet} ca={ca} /> : <TokenView key={ca} ca={ca} />}
      </>
    );
  }

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
