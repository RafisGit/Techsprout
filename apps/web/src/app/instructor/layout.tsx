import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth';
import Hero from '@/components/Hero';
import { InstructorNav } from '@/components/instructor/InstructorNav';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('techsprout_session')?.value;

  if (!sessionToken) {
    redirect('/login');
  }

  const user = await getCurrentUser(`techsprout_session=${sessionToken}`);
  if (!user) {
    redirect('/login');
  }

  // Authorization check: Instructor and Admin only
  if (user.role !== 'instructor' && user.role !== 'admin') {
    return (
      <>
        <Hero pageName='Instructor Portal' />
        <section className='container mx-auto px-4 py-12 max-w-4xl'>
          <div className='p-8 bg-red-50 text-red-800 rounded-2xl border border-red-200 shadow-xs flex flex-col items-center text-center'>
            <ShieldAlert className='w-16 h-16 text-red-600 mb-4' />
            <h2 className='text-2xl font-bold mb-2'>Access Denied (403 Forbidden)</h2>
            <p className='text-gray-600 mb-6 max-w-md'>
              You do not have educator or instructor privileges to access the Instructor Portal.
            </p>
            <Link
              href='/dashboard'
              className='px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors'
            >
              Return to Dashboard
            </Link>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Hero pageName='Instructor Portal' />
      <section className='container mx-auto px-4 py-8 max-w-7xl'>
        <InstructorNav />
        {children}
      </section>
    </>
  );
}
