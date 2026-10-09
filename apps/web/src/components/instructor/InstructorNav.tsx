'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, User, UserCheck } from 'lucide-react';
import { useCurrentUser } from '@/lib/useCurrentUser';

export function InstructorNav() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();

  const navLinks = [
    {
      title: 'Dashboard',
      href: '/instructor/dashboard',
      icon: LayoutDashboard,
    },
    {
      title: 'My Courses',
      href: '/instructor/courses',
      icon: BookOpen,
    },
    {
      title: 'Profile',
      href: '/instructor/profile',
      icon: User,
    },
  ];

  return (
    <div className='bg-white border-b border-gray-200 shadow-xs mb-8 rounded-xl px-4 py-3 sm:px-6'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        {/* Navigation tabs */}
        <nav
          aria-label='Instructor Portal Navigation'
          className='flex items-center space-x-1 sm:space-x-2 overflow-x-auto'
        >
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive =
              pathname === link.href ||
              (link.href !== '/instructor/dashboard' && pathname.startsWith(link.href));

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                  isActive
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className='w-4 h-4' />
                <span>{link.title}</span>
              </Link>
            );
          })}
        </nav>

        {/* Current user & role */}
        {user && (
          <div className='flex items-center space-x-3 text-xs text-gray-500 border-t sm:border-t-0 pt-2 sm:pt-0'>
            <div className='flex items-center space-x-1.5'>
              <UserCheck className='w-4 h-4 text-emerald-600' />
              <span className='font-medium text-gray-700'>{user.name}</span>
            </div>
            <span className='px-2 py-0.5 rounded-full font-semibold capitalize bg-emerald-50 text-emerald-700 border border-emerald-200'>
              {user.role}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
