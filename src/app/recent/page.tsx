import type { Metadata } from 'next';
import { RecentList } from '../../components/RecentList';

export const metadata: Metadata = { title: 'Recent', robots: { index: false } };

export default function RecentPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-[22px] font-semibold tracking-tight">Recent</h1>
      <p className="mt-1 text-[13.5px] text-muted">The last tokens and wallets opened in this browser.</p>
      <div className="mt-5">
        <RecentList />
      </div>
    </div>
  );
}
