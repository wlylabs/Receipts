import type { Metadata } from 'next';
import { TraderView } from '../../../components/TraderView';
import { short } from '../../../lib/format';
import { ROUTES } from '../../../lib/site';

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const title = `Receipts on ${short(address)}`;
  const description = `Call it before it prints: is ${short(address)} up or down on Bordrless? Every real trade, priced.`;
  return { title, description, alternates: { canonical: ROUTES.trader(address) }, openGraph: { title, description, url: ROUTES.trader(address) }, robots: { index: false } };
}

export default async function TraderPage({ params }: Props) {
  const { address } = await params;
  return <TraderView address={decodeURIComponent(address)} />;
}
