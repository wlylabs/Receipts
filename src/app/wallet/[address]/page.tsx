import type { Metadata } from 'next';
import { TraderView } from '../../../components/TraderView';
import { short } from '../../../lib/format';

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ ca?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const title = `Replay ${short(address)}`;
  const description = `Watch ${short(address)}’s real trades replay on the chart, priced in USD, and turn them into a video.`;
  return { title, description, openGraph: { title, description }, robots: { index: false } };
}

export default async function WalletPage({ params, searchParams }: Props) {
  const { address } = await params;
  const { ca } = await searchParams;
  return <TraderView address={decodeURIComponent(address)} ca={typeof ca === 'string' ? ca : ''} />;
}
