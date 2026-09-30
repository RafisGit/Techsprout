'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { fetchUserEnrollments } from '@/lib/api/learning';
import Hero from '@/components/Hero';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { TextBadge } from '@/components/ui/text-badge';
import {
  BookOpen,
  CheckCircle2,
  PlayCircle,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Clock,
  Layers,
  Archive,
  GraduationCap,
  LogIn,
} from 'lucide-react';
import type { EnrolledCourseItemDto } from '@techsprout/contracts';

type FilterTab = 'ALL' | 'ACTIVE' | 'COMPLETED';

export default function MyCoursesPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  const {
    data: currentUser,
    isLoading: isAuthLoading,
  } = useCurrentUser();

  const {
    data: enrollmentsData,
    isLoading: isEnrollmentsLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['userEnrollments', activeTab === 'ALL' ? undefined : activeTab],
    queryFn: () =>
      fetchUserEnrollments({
        status: activeTab === 'ALL' ? undefined : activeTab,
        limit: 50,
      }),
    enabled: !!currentUser,
    staleTime: 60 * 1000,
  });

  const isLoading = isAuthLoading || (!!currentUser && isEnrollmentsLoading);

  return (
    <div className='min-h-screen bg-[#F8FAFC] pb-24'>
      <Hero pageName='My Courses' />

      <main className='container mx-auto px-4 max-w-7xl pt-10 sm:pt-12'>
        {/* Unauthenticated State */}
        {!isAuthLoading && !currentUser && (
          <div className='max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-gray-200/80 shadow-xs text-center space-y-4'>
            <div className='w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto'>
              <GraduationCap className='w-8 h-8' />
            </div>
            <Title h={2} className='text-2xl font-bold text-gray-900'>
              Sign in to view your courses
            </Title>
            <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
              You must be logged in to view your active enrollments and track your learning progress.
            </p>
            <div className='pt-2'>
              <Link href='/login?redirect=/my-courses'>
                <Button className='rounded-xl text-xs font-semibold px-6 py-2.5 bg-primary text-white hover:bg-primary/90 shadow-sm'>
                  <LogIn className='w-4 h-4 mr-2' />
                  Log In to Continue
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Authenticated Workspace */}
        {currentUser && (
          <div className='space-y-8'>
            {/* Header & Tabs */}
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5'>
              <div>
                <Title h={1} className='text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight'>
                  Student Dashboard
                </Title>
                <p className='text-xs sm:text-sm text-gray-500 mt-1'>
                  Manage your enrolled courses, resume study sessions, and review completed subjects.
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className='inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200/60 self-start sm:self-auto'>
                {(
                  [
                    { key: 'ALL', label: 'All Courses' },
                    { key: 'ACTIVE', label: 'In Progress' },
                    { key: 'COMPLETED', label: 'Completed' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === tab.key
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading Skeletons */}
            {isLoading && (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={idx}
                    className='bg-white rounded-3xl border border-gray-200/80 p-5 space-y-4 animate-pulse shadow-xs'
                  >
                    <div className='h-44 w-full bg-gray-100 rounded-2xl' />
                    <div className='h-4 w-24 bg-gray-100 rounded' />
                    <div className='h-6 w-3/4 bg-gray-100 rounded' />
                    <div className='h-2.5 w-full bg-gray-100 rounded-full' />
                    <div className='h-10 w-full bg-gray-100 rounded-xl' />
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {!isLoading && isError && (
              <div className='max-w-md mx-auto my-8 bg-white rounded-3xl p-8 border border-red-100 shadow-xs text-center space-y-4'>
                <div className='w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
                  <AlertCircle className='w-7 h-7' />
                </div>
                <h3 className='text-lg font-bold text-gray-900'>Unable to load enrollments</h3>
                <p className='text-xs text-gray-500'>
                  {(error as any)?.response?.data?.message ||
                    'An unexpected error occurred while fetching your enrolled courses.'}
                </p>
                <Button onClick={() => refetch()} size='sm' className='rounded-xl text-xs'>
                  <RotateCcw className='w-3.5 h-3.5 mr-1.5' />
                  Try Again
                </Button>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !isError && (!enrollmentsData?.items || enrollmentsData.items.length === 0) && (
              <div className='max-w-md mx-auto my-12 bg-white rounded-3xl p-10 border border-dashed border-gray-200 shadow-2xs text-center space-y-4'>
                <div className='w-16 h-16 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto'>
                  <BookOpen className='w-8 h-8' />
                </div>
                <h3 className='text-lg font-bold text-gray-900'>No enrolled courses</h3>
                <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
                  {activeTab === 'COMPLETED'
                    ? "You haven't completed any courses yet. Keep learning to achieve full mastery!"
                    : activeTab === 'ACTIVE'
                    ? 'You have no courses in progress. Explore our catalog to start learning.'
                    : "You haven't enrolled in any courses yet. Find a course that matches your learning goals."}
                </p>
                <div className='pt-2'>
                  <Link href='/courses'>
                    <Button className='rounded-xl text-xs font-semibold px-5 py-2.5 bg-primary text-white hover:bg-primary/90'>
                      Browse Course Catalog
                      <ArrowRight className='w-3.5 h-3.5 ml-1.5' />
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Course Cards Grid */}
            {!isLoading && !isError && enrollmentsData?.items && enrollmentsData.items.length > 0 && (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                {enrollmentsData.items.map((item: EnrolledCourseItemDto) => {
                  const isArchived = item.course.status === 'ARCHIVED';
                  const isCompleted = item.status === 'COMPLETED';
                  const progressPct = item.progress?.percentage ?? 0;
                  const completedLessons = item.progress?.completedLessons ?? 0;
                  const totalLessons = item.progress?.totalLessons ?? 0;

                  return (
                    <div
                      key={item.enrollmentId}
                      className='bg-white rounded-3xl border border-gray-200/80 shadow-xs hover:shadow-md transition flex flex-col justify-between overflow-hidden p-5 group'
                    >
                      <div className='space-y-4'>
                        {/* Course Thumbnail */}
                        <div className='relative h-44 w-full rounded-2xl overflow-hidden bg-gray-100'>
                          {item.course.thumbnailUrl ? (
                            <Image
                              src={item.course.thumbnailUrl}
                              alt={item.course.title}
                              fill
                              className='object-cover group-hover:scale-105 transition-transform duration-300'
                              sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
                            />
                          ) : (
                            <div className='w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold text-sm'>
                              TechSprout LMS
                            </div>
                          )}

                          {/* Status Badge Overlays */}
                          <div className='absolute top-3 left-3 flex flex-wrap gap-1.5'>
                            {isCompleted ? (
                              <span className='inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-600 text-white shadow-xs'>
                                <CheckCircle2 className='w-3 h-3' />
                                Completed
                              </span>
                            ) : (
                              <span className='inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary text-white shadow-xs'>
                                <PlayCircle className='w-3 h-3' />
                                Active
                              </span>
                            )}

                            {isArchived && (
                              <span
                                className='inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500 text-white shadow-xs'
                                title='This course is archived, but you retain full learner access'
                              >
                                <Archive className='w-3 h-3' />
                                Archived
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Category & Meta */}
                        <div className='flex items-center justify-between text-xs text-gray-400'>
                          {item.course.category ? (
                            <TextBadge className='bg-primary/10 text-primary font-semibold text-[11px] px-2.5 py-0.5 rounded-full'>
                              {item.course.category.name}
                            </TextBadge>
                          ) : (
                            <span />
                          )}
                          {item.course.instructor?.name && (
                            <span className='truncate max-w-[140px]'>
                              {item.course.instructor.name}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <Link href={`/learn/${item.course.slug}`}>
                          <h3 className='text-base font-bold text-gray-900 group-hover:text-primary transition line-clamp-2 leading-snug'>
                            {item.course.title}
                          </h3>
                        </Link>

                        {/* Progress Bar & Details */}
                        <div className='space-y-1.5 pt-1'>
                          <div className='flex items-center justify-between text-xs'>
                            <span className='text-gray-500 font-medium'>Progress</span>
                            <span className='font-bold text-gray-800'>{progressPct}%</span>
                          </div>
                          <div className='w-full bg-gray-100 rounded-full h-2 overflow-hidden'>
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isCompleted ? 'bg-emerald-500' : 'bg-primary'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                            />
                          </div>
                          <div className='flex items-center justify-between text-[11px] text-gray-400 pt-0.5'>
                            <span>
                              {completedLessons} / {totalLessons} lessons completed
                            </span>
                            {item.resumePoint?.lessonTitle && (
                              <span className='truncate max-w-[150px] text-gray-500' title={item.resumePoint.lessonTitle}>
                                Next: {item.resumePoint.lessonTitle}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Action CTA */}
                      <div className='pt-5 border-t border-gray-100 mt-4'>
                        <Link href={`/learn/${item.course.slug}`} className='block w-full'>
                          <Button
                            className={`w-full rounded-xl py-2.5 text-xs font-bold transition shadow-xs ${
                              isCompleted
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-primary hover:bg-primary/90 text-white'
                            }`}
                          >
                            {isCompleted ? 'Review Course' : 'Continue Learning'}
                            <ArrowRight className='w-3.5 h-3.5 ml-1.5' />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
