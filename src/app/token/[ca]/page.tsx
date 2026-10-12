import { redirect } from 'next/navigation';
import { ROUTES } from '../../../lib/site';

type Props = { params: Promise<{ ca: string }> };

/** Token links from before the app became one page keep working. */
export default async function OldTokenPage({ params }: Props) {
  const { ca } = await params;
  redirect(ROUTES.token(decodeURIComponent(ca)));
}
