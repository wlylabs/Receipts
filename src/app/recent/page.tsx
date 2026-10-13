import { redirect } from 'next/navigation';
import { ROUTES } from '../../lib/site';

/** Recent now sits on the one page, under the paste box. */
export default function OldRecentPage() {
  redirect(ROUTES.home);
}
