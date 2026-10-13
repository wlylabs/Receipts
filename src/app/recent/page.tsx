import type { Metadata } from 'next';
import { RecentList } from '../../components/RecentList';

export const metadata: Metadata = { title: 'Recent', robots: { index: false } };

export default function RecentPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-10">
      <h1 className="display reveal text-[32px]">Recent</h1>
      <div className="mt-5">
        <RecentList />
      </div>
    </div>
  );
}
