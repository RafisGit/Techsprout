import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth';
import { AdminAnalyticsOverviewClient } from '@/components/admin/AdminAnalyticsOverviewClient';

export const metadata: Metadata = {
  title: 'Platform Analytics Overview | TechSprout Admin',
  description: 'Institutional metrics, review queue SLAs, and catalog course performance rollups.',
};

export default async function AdminOverviewPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('techsprout_session')?.value;

  if (!sessionToken) {
    redirect('/login?redirect=/dashboard/admin/overview');
  }

  const user = await getCurrentUser(`techsprout_session=${sessionToken}`);

  if (!user || user.role !== 'admin') {
    return (
      <div className='p-8 bg-red-50 text-red-800 rounded-2xl border border-red-200 shadow-xs max-w-xl mx-auto my-12 text-center'>
        <h2 className='text-2xl font-bold mb-2'>Access Denied (403 Forbidden)</h2>
        <p className='text-xs text-red-700 leading-relaxed'>
          You do not have administrative privileges to access institutional platform analytics.
        </p>
      </div>
    );
  }

  return <AdminAnalyticsOverviewClient />;
}
