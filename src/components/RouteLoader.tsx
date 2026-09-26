'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function RouteLoader() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);

    const timeout = setTimeout(() => {
      setLoading(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [pathname]);

  if (!loading) return null;

  return <div className='bg-primary fixed top-0 left-0 z-50 h-1 w-full animate-pulse' />;

  // if full screen needed
  // return (
  //   <div className='bg-opacity-90 fixed inset-0 z-[1000] flex items-center justify-center bg-white transition-opacity duration-300'>
  //     <div className='border-primary h-12 w-12 animate-spin rounded-full border-4 border-t-transparent' />
  //   </div>
  // );
}
