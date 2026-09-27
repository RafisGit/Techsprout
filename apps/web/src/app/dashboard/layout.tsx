import Hero from '@/components/Hero';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth';

async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('techsprout_session')?.value;

  if (!sessionToken) {
    redirect('/login');
  }

  const user = await getCurrentUser(`techsprout_session=${sessionToken}`);
  if (!user) {
    redirect('/login');
  }

  return (
    <>
      <Hero pageName='Dashboard' />
      <section className='container mx-auto px-4 py-8'>{children}</section>
    </>
  );
}

export default DashboardLayout;
