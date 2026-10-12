import type { Metadata } from 'next';
import { TokenView } from '../../../components/TokenView';
import { short } from '../../../lib/format';
import { ROUTES } from '../../../lib/site';

type Props = { params: Promise<{ ca: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ca } = await params;
  const title = `Top traders of ${short(ca)}`;
  const description = 'The token’s top 3 gainers and biggest losers lately. Pick one to replay its trades and make a video.';
  return { title, description, alternates: { canonical: ROUTES.token(ca) }, openGraph: { title, description, url: ROUTES.token(ca) }, robots: { index: false } };
}

export default async function TokenPage({ params }: Props) {
  const { ca } = await params;
  return <TokenView ca={decodeURIComponent(ca)} />;
}
