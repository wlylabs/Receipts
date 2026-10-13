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
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-[env(safe-area-inset-top)] sm:px-6">
      <header className="flex h-16 items-center justify-between">
        <Wordmark full />
        <div className="flex items-center gap-1">
          <a href="#how" className="btn btn-ghost h-9 min-h-0 px-3 text-[13px]">
            How it works
          </a>
          <ThemeToggle className="h-9" />
        </div>
      </header>

      <section className="grid items-center gap-12 pb-16 pt-6 sm:pt-12 lg:min-h-[calc(100dvh-8rem)] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16 lg:pt-0" aria-labelledby="hero">
        <div className="min-w-0">
          <p className="reveal label flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-pos" aria-hidden /> On-chain P&amp;L, replayed
          </p>
          <h1 id="hero" className="display reveal mt-4 text-[46px] sm:text-[72px]" style={{ '--d': '60ms' } as CSSProperties}>
            Pull the <span className="mark">receipts</span>
            <br />
            on any trade.
          </h1>
          <p className="reveal mt-5 max-w-xl text-pretty text-[16px] leading-relaxed text-ink-2 sm:text-[18px]" style={{ '--d': '120ms' } as CSSProperties}>
            Paste a token to see who won and who got wrecked. Paste a wallet to watch its real trades play back on the chart, then keep it as a video.
          </p>
          <div id="paste" className="reveal mt-8 max-w-xl scroll-mt-24" style={{ '--d': '180ms' } as CSSProperties}>
            <Omnibox />
            <p className="mt-3 text-[12.5px] text-muted">A token shows who won and who got wrecked; a wallet replays its trades. No sign-up, no wallet connect.</p>
          </div>
          <ul className="reveal mt-8 flex max-w-xl flex-wrap gap-1.5" style={{ '--d': '240ms' } as CSSProperties} aria-label="Supported chains">
            {SUPPORTED.map((c) => (
              <li key={c} className="chip">
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="reveal hidden lg:block" style={{ '--d': '300ms' } as CSSProperties}>
          <SampleReceipt />
        </div>
      </section>

      <section id="how" className="scroll-mt-8 border-t border-dashed border-line-strong pt-12" aria-labelledby="how-title">
        <h2 id="how-title" className="label">
          How it works
        </h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="panel p-5">
              <span className="step">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-4 text-[17px] font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12" aria-label="Recent">
        <RecentList limit={6} hideEmpty title="Pick up where you left off" />
      </section>
    </div>
  );
}

const STEPS = [
  { title: 'Paste an address', body: 'A token CA opens its chart since launch and the top gainers and losers among its latest traders. A wallet opens what it holds.' },
  { title: 'Watch the replay', body: 'Pick a wallet and a token: every buy and sell lands on the candles while the P&L counts up, then the receipt prints.' },
  { title: 'Keep the video', body: 'Square, portrait or wide, with sound. Made in your browser, ready for X, TikTok or YouTube.' },
];
