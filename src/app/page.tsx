import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
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
      <section className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-2xl flex-col justify-center pb-16 pt-10 text-center" aria-labelledby="hero">
        <h1 id="hero" className="display reveal text-[44px] sm:text-[76px]">
          <span className="fade-text">Every trade,</span>
          <br />
          <span className="text-muted">replayed.</span>
        </h1>
        <p className="reveal mx-auto mt-5 max-w-md text-balance text-[15px] leading-relaxed text-muted sm:text-[17px]" style={{ '--d': '120ms' } as CSSProperties}>
          Paste a token or a wallet. Watch it play out. Keep the video.
        </p>
        <div id="paste" className="reveal mt-10 scroll-mt-24 text-left" style={{ '--d': '240ms' } as CSSProperties}>
          <Omnibox />
        </div>
        <p className="reveal mx-auto mt-8 max-w-lg text-balance text-[10.5px] font-medium uppercase leading-relaxed tracking-[0.16em] text-faint" style={{ '--d': '360ms' } as CSSProperties}>
          Solana · Ethereum · Base · BNB · Arbitrum · Polygon · Avalanche · Optimism · Robinhood
        </p>
      </section>
    </div>
  );
}
