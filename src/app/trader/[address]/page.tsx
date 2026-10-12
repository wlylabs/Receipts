import { redirect } from 'next/navigation';

type Props = { params: Promise<{ address: string }>; searchParams: Promise<{ ca?: string | string[] }> };

/** Links shared before wallets moved to /wallet keep working. */
export default async function OldTraderPage({ params, searchParams }: Props) {
  const { address } = await params;
  const { ca } = await searchParams;
  redirect(typeof ca === 'string' ? `/wallet/${address}/?ca=${encodeURIComponent(ca)}` : `/wallet/${address}/`);
}
