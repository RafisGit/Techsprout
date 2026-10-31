import { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/auth';
import { StudentEngagementCounters } from '@/components/student/StudentEngagementCounters';
import { getServerTranslations } from '@/i18n/server';

export const metadata: Metadata = {
  title: 'Student Dashboard | TechSprout School',
  description: 'Track your personal course enrollments, study progress, and certificates earned.',
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('techsprout_session')?.value;
  const user = await getCurrentUser(`techsprout_session=${sessionToken}`);
  const { t } = await getServerTranslations();

  return (
    <div className='space-y-6 max-w-5xl mx-auto'>
      <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs'>
        <h1 className='text-2xl font-bold text-gray-900'>
          {t('dashboard.welcome', { name: user?.name || 'Student' })}
        </h1>
        <p className='text-sm text-gray-600 mt-1'>
          {t('auth.signedInAs')}{' '}
          <strong className='capitalize'>{user?.role || 'student'}</strong>. {t('dashboard.description')}
        </p>
      </div>

      {/* Dynamic Personal Learning Engagement Counters */}
      <StudentEngagementCounters />
    </div>
  );
}
