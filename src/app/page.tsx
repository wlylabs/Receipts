import type { Metadata } from 'next';
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
 * The whole app on one page: the paste box, or whatever was pasted. A token CA shows its
 * all-time chart and top 3 traders; a wallet shows its tokens, then the replay of one.
 */
export default async function HomePage({ searchParams }: Props) {
  const q = await searchParams;
  const ca = one(q.ca);
  const wallet = one(q.wallet);
  const showing = wallet || ca;

  if (showing) {
    // the search in the app bar takes the next address
    return wallet ? <TraderView key={`${wallet}:${ca}`} address={wallet} ca={ca} /> : <TokenView key={ca} ca={ca} />;
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
          Real charts, real wallets, pretend money. Solana, Ethereum, Base, BNB, Arbitrum, Polygon, Avalanche, Optimism and Robinhood Chain.
        </p>
        <div id="paste" className="mt-8 scroll-mt-24 text-left">
          <Omnibox />
        </div>
      </section>
    </div>
  );
}
