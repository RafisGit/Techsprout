import Hero from '@/components/Hero';

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Hero pageName='Dashboard' />
      <section>{children}</section>
    </>
  );
}

export default DashboardLayout;
