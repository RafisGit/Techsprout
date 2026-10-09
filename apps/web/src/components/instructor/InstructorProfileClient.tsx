'use client';

import React from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Button } from '@/components/ui/button';
import { User, Mail, AtSign, ShieldCheck, ArrowRight, Info, BookOpen } from 'lucide-react';

export function InstructorProfileClient() {
  const { data: user, isLoading } = useCurrentUser();

  return (
    <div className='max-w-4xl mx-auto space-y-6'>
      {/* Header */}
      <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs'>
        <h1 className='text-2xl font-bold text-gray-900'>Instructor Profile</h1>
        <p className='text-sm text-gray-600 mt-1'>
          Your educator identity, verified teaching credentials, and institutional affiliation.
        </p>
      </div>

      {/* Info notice about WP-06 full profile editing */}
      <div className='p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 flex items-start gap-3'>
        <Info className='w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5' />
        <div className='text-sm'>
          <p className='font-semibold'>Profile Customization Roadmap</p>
          <p className='mt-0.5 text-blue-700'>
            Full public bio editing, avatar upload, academic credentials, and social links (LinkedIn, GitHub) will be fully customizable in Work Package WP-06. Your current verified account details are shown below.
          </p>
        </div>
      </div>

      {/* Profile Details Card */}
      <div className='bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xs'>
        {isLoading ? (
          <div className='space-y-4'>
            <div className='h-6 w-48 bg-gray-100 rounded-md animate-pulse' />
            <div className='h-10 w-full bg-gray-100 rounded-md animate-pulse' />
            <div className='h-10 w-full bg-gray-100 rounded-md animate-pulse' />
          </div>
        ) : (
          <div className='space-y-6'>
            <div className='flex items-center gap-4 pb-6 border-b border-gray-100'>
              <div className='w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-2xl border border-emerald-200'>
                {user?.name ? user.name[0].toUpperCase() : 'E'}
              </div>
              <div>
                <h2 className='text-xl font-bold text-gray-900'>{user?.name || 'Educator'}</h2>
                <div className='flex items-center gap-2 mt-1'>
                  <span className='inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                    <ShieldCheck className='w-3.5 h-3.5 text-emerald-600' />
                    Verified Instructor
                  </span>
                </div>
              </div>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-6'>
              <div className='p-4 bg-gray-50/60 rounded-xl border border-gray-100'>
                <div className='flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1'>
                  <User className='w-3.5 h-3.5' />
                  <span>Full Name</span>
                </div>
                <div className='text-base font-medium text-gray-900'>{user?.name || '—'}</div>
              </div>

              <div className='p-4 bg-gray-50/60 rounded-xl border border-gray-100'>
                <div className='flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1'>
                  <Mail className='w-3.5 h-3.5' />
                  <span>Email Address</span>
                </div>
                <div className='text-base font-medium text-gray-900'>{user?.email || '—'}</div>
              </div>

              <div className='p-4 bg-gray-50/60 rounded-xl border border-gray-100'>
                <div className='flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1'>
                  <AtSign className='w-3.5 h-3.5' />
                  <span>Username</span>
                </div>
                <div className='text-base font-medium text-gray-900'>{user?.username || '—'}</div>
              </div>

              <div className='p-4 bg-gray-50/60 rounded-xl border border-gray-100'>
                <div className='flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1'>
                  <ShieldCheck className='w-3.5 h-3.5' />
                  <span>Account Role</span>
                </div>
                <div className='text-base font-medium text-gray-900 capitalize'>{user?.role || '—'}</div>
              </div>
            </div>

            <div className='pt-6 border-t border-gray-100 flex items-center justify-between'>
              <Link href='/instructor/dashboard'>
                <Button variant='outline' size='sm'>
                  Return to Dashboard
                </Button>
              </Link>
              <Link href='/instructor/courses'>
                <Button size='sm' className='bg-primary text-white hover:bg-primary/90 flex items-center gap-1.5'>
                  <BookOpen className='w-4 h-4' />
                  <span>Manage Courses</span>
                  <ArrowRight className='w-4 h-4' />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
