import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { AppBar, Wordmark } from '../components/AppBar';
import { ThemeToggle } from '../components/ThemeToggle';
import { Omnibox } from '../components/Omnibox';
import { SampleReceipt } from '../components/SampleReceipt';
import { RecentList } from '../components/RecentList';
import { TokenView } from '../components/TokenView';
import { TraderView } from '../components/TraderView';
import { cleanAddress } from '../lib/receipts';
import { short } from '../lib/format';
import { SUPPORTED } from '../lib/chains';

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
 * all-time chart and top traders; a wallet shows its tokens, then the replay of one.
 */
export default async function HomePage({ searchParams }: Props) {
  const q = await searchParams;
  const ca = one(q.ca);
  const wallet = one(q.wallet);
  const showing = wallet || ca;

  if (showing) {
    return (
      <>
        <AppBar />
        {wallet ? <TraderView key={`${wallet}:${ca}`} address={wallet} ca={ca} /> : <TokenView key={ca} ca={ca} />}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-[env(safe-area-inset-top)] sm:px-6">
      <header className="flex h-16 items-center justify-between">
        <Wordmark full />
        <nav className="flex items-center gap-1">
          <a href="#how" className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]">
            How it works
          </a>
          <ThemeToggle className="h-9" />
        </nav>
      </header>

      {/* the hero is a viewfinder: corner brackets, a recording light and a timecode */}
      <section className="frame mt-2 px-5 py-14 sm:px-10 sm:py-20 lg:min-h-[calc(100dvh-7rem)] lg:content-center" aria-labelledby="hero">
        <div className="label pointer-events-none absolute inset-x-5 top-4 flex items-center justify-between sm:inset-x-10" aria-hidden>
          <span className="flex items-center gap-2">
            <span className="rec size-1.5 rounded-full bg-neg" /> REC
          </span>
          <span className="num">00:00:00:00</span>
        </div>
        <div className="label pointer-events-none absolute inset-x-5 bottom-4 hidden items-center justify-between sm:inset-x-10 sm:flex" aria-hidden>
          <span>On-chain · No sign-up</span>
          <span>16:9 · 9:16 · 1:1</span>
        </div>

        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20">
          <div className="min-w-0">
            <p className="reveal label">On-chain P&amp;L, replayed</p>
            <h1 id="hero" className="display reveal mt-5 text-[44px] sm:text-[76px]" style={{ '--d': '80ms' } as CSSProperties}>
              Pull the <span className="mark">receipts</span> on any trade.
            </h1>
            <p className="reveal mt-6 max-w-lg text-pretty text-[16px] leading-relaxed text-muted sm:text-[17px]" style={{ '--d': '160ms' } as CSSProperties}>
              Paste a token to see who won and who got wrecked. Paste a wallet to watch its real trades play back on the chart, then keep it as a video.
            </p>
            <div id="paste" className="reveal mt-9 max-w-xl scroll-mt-24" style={{ '--d': '240ms' } as CSSProperties}>
              <Omnibox />
            </div>
            <ul className="reveal mt-6 flex max-w-xl flex-wrap gap-1.5" style={{ '--d': '320ms' } as CSSProperties} aria-label="Supported chains">
              {SUPPORTED.map((c) => (
                <li key={c} className="chip">
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <div className="reveal hidden lg:block" style={{ '--d': '420ms' } as CSSProperties}>
            <SampleReceipt />
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-8 pt-24" aria-labelledby="how-title">
        <div className="flex items-end justify-between gap-6">
          <h2 id="how-title" className="display text-[32px] sm:text-[44px]">
            Three takes.
          </h2>
          <p className="label hidden sm:block">How it works</p>
        </div>
        <ol className="mt-10 grid border-t border-line md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-b border-line py-8 md:border-b-0 md:py-10 md:pr-8 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:pl-8">
              <span className="step">
                {String(i + 1).padStart(2, '0')} <span className="text-faint">/ 03</span>
              </span>
              <h3 className="mt-6 text-[19px] font-semibold tracking-[-0.02em]">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16" aria-label="Recent">
        <RecentList limit={6} hideEmpty title="Pick up where you left off" />
      </section>

      <footer className="label mt-24 flex items-center justify-between border-t border-line pt-6">
        <span>receipts</span>
        <span>Free, public data</span>
      </footer>
    </div>
  );
}

const STEPS = [
  { title: 'Paste an address', body: 'A token CA opens its chart since launch and the top gainers and losers among its latest traders. A wallet opens what it holds.' },
  { title: 'Watch the replay', body: 'Pick a wallet and a token: every buy and sell lands on the candles while the P&L counts up, then the receipt prints.' },
  { title: 'Keep the video', body: 'Square, portrait or wide, with sound. Made in your browser, ready for X, TikTok or YouTube.' },
];
