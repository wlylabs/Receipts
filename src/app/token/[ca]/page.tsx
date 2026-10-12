import type { Metadata } from 'next';
import { TokenView } from '../../../components/TokenView';
import { short } from '../../../lib/format';
import { ROUTES } from '../../../lib/site';

type Props = { params: Promise<{ ca: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ca } = await params;
  const title = `Ape into ${short(ca)}`;
  const description = 'Pick an entry and an exit on the token’s real chart, print the receipt, and see where you’d rank among its real traders.';
  return { title, description, alternates: { canonical: ROUTES.token(ca) }, openGraph: { title, description, url: ROUTES.token(ca) }, robots: { index: false } };
}

export default async function TokenPage({ params }: Props) {
  const { ca } = await params;
  return <TokenView ca={decodeURIComponent(ca)} />;
}
