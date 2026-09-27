import { cookies } from 'next/headers';
import { getCurrentUser } from '@/auth';

export default async function AdminOverview() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('techsprout_session')?.value;
  const user = await getCurrentUser(`techsprout_session=${sessionToken}`);

  if (!user || user.role !== 'admin') {
    return (
      <div className='p-6 bg-red-50 text-red-700 rounded-lg border border-red-200'>
        <h2 className='text-xl font-bold'>Access Denied (403 Forbidden)</h2>
        <p className='mt-2'>You do not have administrative privileges to access this page.</p>
      </div>
    );
  }

  return (
    <section className='p-6 bg-white rounded-xl shadow-sm'>
      <h2 className='text-2xl font-bold mb-4'>Admin Overview Portal</h2>
      <p className='text-gray-600 mb-6'>
        Logged in as Administrator: <strong>{user.name}</strong> ({user.email})
      </p>
      <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
        <div className='p-4 bg-gray-50 border rounded-lg'>
          <h4 className='text-sm text-gray-500'>Total Students</h4>
          <p className='text-xl font-bold mt-1'>Active</p>
        </div>
        <div className='p-4 bg-gray-50 border rounded-lg'>
          <h4 className='text-sm text-gray-500'>Active Courses</h4>
          <p className='text-xl font-bold mt-1'>P1 Foundation</p>
        </div>
        <div className='p-4 bg-gray-50 border rounded-lg'>
          <h4 className='text-sm text-gray-500'>Security Audits</h4>
          <p className='text-xl font-bold mt-1 text-green-600'>Active</p>
        </div>
        <div className='p-4 bg-gray-50 border rounded-lg'>
          <h4 className='text-sm text-gray-500'>RBAC Status</h4>
          <p className='text-xl font-bold mt-1 text-green-600'>Enforced</p>
        </div>
      </div>
    </section>
  );
}
