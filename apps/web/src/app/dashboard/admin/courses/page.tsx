import { cookies } from 'next/headers';
import { getCurrentUser } from '@/auth';

export default async function AdminCourses() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('techsprout_session')?.value;
  const user = await getCurrentUser(`techsprout_session=${sessionToken}`);

  if (!user || user.role !== 'admin') {
    return (
      <div className='p-6 bg-red-50 text-red-700 rounded-lg border border-red-200'>
        <h2 className='text-xl font-bold'>Access Denied (403 Forbidden)</h2>
        <p className='mt-2'>You do not have administrative privileges to manage courses.</p>
      </div>
    );
  }

  return (
    <section className='p-6 bg-white rounded-xl shadow-sm'>
      <h2 className='text-2xl font-bold mb-4'>Course Administration</h2>
      <p className='text-gray-600 mb-6'>
        Institutional Course Management (Catalog creation unlocked in Phase P2).
      </p>
      <div className='p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg'>
        <p className='font-semibold'>P1 Foundation Status:</p>
        <p className='text-sm mt-1'>
          Course creation is restricted to administrators per approved product decision.
        </p>
      </div>
    </section>
  );
}
