import { redirect } from 'next/navigation';
import { ROUTES } from '../../../lib/site';

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ ca?: string | string[] }> };

/** Links shared before wallets moved to /wallet keep working. */
export default async function OldTraderPage({ params, searchParams }: Props) {
  const { address } = await params;
  const { ca } = await searchParams;
  const a = decodeURIComponent(address);
  redirect(typeof ca === 'string' && ca ? ROUTES.trader(a, ca) : ROUTES.wallet(a));
}
