import { cookies } from 'next/headers';
import { getCurrentUser } from '@/auth';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('techsprout_session')?.value;
  const user = await getCurrentUser(`techsprout_session=${sessionToken}`);

  return (
    <div className='p-6 bg-white rounded-xl shadow-sm'>
      <h2 className='text-2xl font-bold mb-4'>Welcome back, {user?.name || 'Student'}!</h2>
      <p className='text-gray-600 mb-6'>
        You are logged in as a <strong>{user?.role || 'student'}</strong>.
      </p>
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        <div className='p-4 bg-primary/10 rounded-lg'>
          <h3 className='font-semibold text-primary'>Enrolled Courses</h3>
          <p className='text-2xl font-bold mt-2'>0</p>
        </div>
        <div className='p-4 bg-accent/10 rounded-lg'>
          <h3 className='font-semibold text-accent'>In Progress</h3>
          <p className='text-2xl font-bold mt-2'>0</p>
        </div>
        <div className='p-4 bg-green-50 rounded-lg'>
          <h3 className='font-semibold text-green-700'>Certificates</h3>
          <p className='text-2xl font-bold mt-2'>0</p>
        </div>
      </div>
    </div>
  );
}
