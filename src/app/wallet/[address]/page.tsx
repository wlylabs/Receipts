import type { Metadata } from 'next';
import { TraderView } from '../../../components/TraderView';
import { short } from '../../../lib/format';

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ ca?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const title = `Replay ${short(address)}`;
  const description = `Call it, then watch it replay: is ${short(address)} up or down? Real trades, priced in USD.`;
  return { title, description, openGraph: { title, description }, robots: { index: false } };
}

export default async function WalletPage({ params, searchParams }: Props) {
  const { address } = await params;
  const { ca } = await searchParams;
  return <TraderView address={decodeURIComponent(address)} ca={typeof ca === 'string' ? ca : ''} />;
}
