'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchStudentLearningEngagement } from '@/lib/api/learning';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  Clock,
  Award,
  ArrowRight,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from '@/i18n';

export function StudentEngagementCounters() {
  const { t, formatNumber } = useTranslation();

  const {
    data: engagement,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['studentEngagementAnalytics'],
    queryFn: () => fetchStudentLearningEngagement(),
    staleTime: 60 * 1000,
  });

  const errorMessage =
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
    (error as { message?: string })?.message ||
    t('states.loadFailed');

  if (isLoading) {
    return (
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse'>
        {[1, 2, 3].map((i) => (
          <div key={i} className='p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-3'>
            <div className='h-4 w-28 bg-gray-200 rounded' />
            <div className='h-8 w-16 bg-gray-200 rounded' />
            <div className='h-3 w-40 bg-gray-200 rounded' />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className='p-5 bg-rose-50 text-rose-800 rounded-2xl border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
        <div className='flex items-center gap-3'>
          <AlertCircle className='w-5 h-5 text-rose-600 flex-shrink-0' />
          <div>
            <h4 className='text-sm font-bold'>{t('dashboard.unableToLoadActivity')}</h4>
            <p className='text-xs text-rose-700 mt-0.5'>{errorMessage}</p>
          </div>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => refetch()}
          className='text-xs text-rose-800 border-rose-300 hover:bg-rose-100 self-start sm:self-auto cursor-pointer'
        >
          {t('actions.retry')}
        </Button>
      </div>
    );
  }

  const enrolledCount = engagement?.enrolledCoursesCount ?? 0;
  const inProgressCount = engagement?.inProgressCoursesCount ?? 0;
  const certificatesCount = engagement?.completedCertificatesCount ?? 0;

  return (
    <div className='space-y-6'>
      {/* 3 Primary Student Metric Cards */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        {/* Card 1: Enrolled Courses */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between hover:border-gray-300 transition-colors'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-semibold text-gray-600'>{t('dashboard.enrolledCourses')}</span>
            <div className='w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center'>
              <BookOpen className='w-5 h-5' />
            </div>
          </div>
          <div className='mt-4'>
            <div className='text-3xl font-extrabold text-gray-900'>{formatNumber(enrolledCount)}</div>
            <p className='text-xs text-gray-500 mt-1'>
              {enrolledCount === 0
                ? t('dashboard.noEnrolled')
                : enrolledCount === 1
                  ? t('dashboard.enrolledCountSingle')
                  : t('dashboard.enrolledCountPlural', { count: enrolledCount })}
            </p>
          </div>
          <div className='mt-4 pt-3 border-t border-gray-100'>
            <Link
              href='/my-courses'
              className='text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1'
            >
              <span>{t('actions.viewMyCourses')}</span>
              <ArrowRight className='w-3 h-3' />
            </Link>
          </div>
        </div>

        {/* Card 2: In Progress */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between hover:border-gray-300 transition-colors'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-semibold text-gray-600'>{t('dashboard.inProgress')}</span>
            <div className='w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center'>
              <Clock className='w-5 h-5' />
            </div>
          </div>
          <div className='mt-4'>
            <div className='text-3xl font-extrabold text-gray-900'>{formatNumber(inProgressCount)}</div>
            <p className='text-xs text-gray-500 mt-1'>
              {inProgressCount === 0
                ? t('dashboard.noInProgress')
                : inProgressCount === 1
                  ? t('dashboard.inProgressCountSingle')
                  : t('dashboard.inProgressCountPlural', { count: inProgressCount })}
            </p>
          </div>
          <div className='mt-4 pt-3 border-t border-gray-100'>
            <Link
              href='/my-courses'
              className='text-xs font-semibold text-amber-700 hover:underline inline-flex items-center gap-1'
            >
              <span>{t('actions.resumeLearning')}</span>
              <ArrowRight className='w-3 h-3' />
            </Link>
          </div>
        </div>

        {/* Card 3: Certificates */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between hover:border-gray-300 transition-colors'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-semibold text-gray-600'>{t('dashboard.certificates')}</span>
            <div className='w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center'>
              <Award className='w-5 h-5' />
            </div>
          </div>
          <div className='mt-4'>
            <div className='text-3xl font-extrabold text-gray-900'>{formatNumber(certificatesCount)}</div>
            <p className='text-xs text-gray-500 mt-1'>
              {certificatesCount === 0
                ? t('dashboard.noCertificates')
                : certificatesCount === 1
                  ? t('dashboard.certificatesCountSingle')
                  : t('dashboard.certificatesCountPlural', { count: certificatesCount })}
            </p>
          </div>
          <div className='mt-4 pt-3 border-t border-gray-100'>
            <Link
              href='/my-courses'
              className='text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1'
            >
              <span>{t('actions.reviewAchievements')}</span>
              <ArrowRight className='w-3 h-3' />
            </Link>
          </div>
        </div>
      </div>

      {/* Zero Enrolled Callout Banner */}
      {enrolledCount === 0 && (
        <div className='p-6 bg-linear-to-r from-primary/5 via-primary/10 to-transparent rounded-2xl border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <div className='space-y-1'>
            <div className='flex items-center gap-2'>
              <Sparkles className='w-5 h-5 text-primary' />
              <h4 className='text-base font-bold text-gray-900'>{t('dashboard.readyToLearn')}</h4>
            </div>
            <p className='text-xs text-gray-600 max-w-xl'>
              {t('dashboard.readyToLearnDescription')}
            </p>
          </div>
          <Link href='/courses'>
            <Button className='bg-primary text-white hover:bg-primary/90 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer'>
              <span>{t('actions.browseCatalog')}</span>
              <ArrowRight className='w-3.5 h-3.5' />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
