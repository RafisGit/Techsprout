'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  fetchInstructorCourses,
  fetchInstructorAnalyticsOverview,
  type InstructorCourseBreakdownDto,
} from '@/lib/api/instructor';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  FileEdit,
  Clock,
  Users,
  PlusCircle,
  GraduationCap,
  ArrowRight,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  BarChart3,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export function InstructorDashboardClient() {
  const { data: user } = useCurrentUser();

  // Query Courses Metadata
  const {
    data: coursesData,
    isLoading: isLoadingCourses,
    isError: isCoursesError,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ['instructorCourses', 'dashboard'],
    queryFn: () => fetchInstructorCourses({ limit: 100 }),
    staleTime: 60 * 1000,
  });

  // Query Dynamic Analytics Overview
  const {
    data: analyticsOverview,
    isLoading: isLoadingAnalytics,
    isError: isAnalyticsError,
    refetch: refetchAnalytics,
  } = useQuery({
    queryKey: ['instructorAnalyticsOverview'],
    queryFn: () => fetchInstructorAnalyticsOverview(),
    staleTime: 60 * 1000,
  });

  const courses = coursesData?.items || [];
  const publishedCount = courses.filter((c) => c.status === 'PUBLISHED').length;
  const draftCount = courses.filter((c) => c.status === 'DRAFT').length;
  const inReviewCount = courses.filter((c) => c.status === 'IN_REVIEW').length;
  const totalCourses = courses.length;

  const courseBreakdowns: InstructorCourseBreakdownDto[] =
    analyticsOverview?.courseBreakdown || [];

  return (
    <div className='space-y-8'>
      {/* Header & Quick Action */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs'>
        <div>
          <h1 className='text-2xl font-bold text-gray-900'>
            Welcome back, {user?.name || 'Educator'}!
          </h1>
          <p className='text-sm text-gray-600 mt-1'>
            Manage your courses, oversee student learning progress, and explore curriculum analytics.
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <Link href='/admin/courses/new'>
            <Button className='bg-primary text-white hover:bg-primary/90 flex items-center gap-2'>
              <PlusCircle className='w-4 h-4' />
              <span>Create New Course</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Portfolio Learning Analytics Metric Grid */}
      <div className='space-y-3'>
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='text-lg font-bold text-gray-900'>Portfolio Learning Analytics</h2>
            <p className='text-xs text-gray-500'>
              Real-time student engagement and completion rates across all your authored courses.
            </p>
          </div>
          {isAnalyticsError && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => refetchAnalytics()}
              className='text-xs text-rose-600 border-rose-200'
            >
              Retry Analytics
            </Button>
          )}
        </div>

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5'>
          {/* Metric 1: Total Unique Enrolled Learners */}
          <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium text-gray-500'>Unique Learners</span>
              <div className='w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center'>
                <Users className='w-5 h-5' />
              </div>
            </div>
            <div className='mt-4'>
              {isLoadingAnalytics ? (
                <div className='h-8 w-16 bg-gray-200 animate-pulse rounded-md' />
              ) : (
                <div className='text-3xl font-extrabold text-gray-900'>
                  {analyticsOverview?.totalUniqueStudents ?? 0}
                </div>
              )}
              <p className='text-xs text-gray-500 mt-1'>Distinct students enrolled</p>
            </div>
          </div>

          {/* Metric 2: Total Course Completions */}
          <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium text-gray-500'>Course Completions</span>
              <div className='w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center'>
                <CheckCircle2 className='w-5 h-5' />
              </div>
            </div>
            <div className='mt-4'>
              {isLoadingAnalytics ? (
                <div className='h-8 w-16 bg-gray-200 animate-pulse rounded-md' />
              ) : (
                <div className='text-3xl font-extrabold text-gray-900'>
                  {analyticsOverview?.totalCourseCompletions ?? 0}
                </div>
              )}
              <p className='text-xs text-gray-500 mt-1'>Certificates/completions awarded</p>
            </div>
          </div>

          {/* Metric 3: Portfolio Completion Rate */}
          <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium text-gray-500'>Portfolio Completion Rate</span>
              <div className='w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center'>
                <TrendingUp className='w-5 h-5' />
              </div>
            </div>
            <div className='mt-4'>
              {isLoadingAnalytics ? (
                <div className='h-8 w-16 bg-gray-200 animate-pulse rounded-md' />
              ) : (
                <div className='text-3xl font-extrabold text-gray-900'>
                  {analyticsOverview?.portfolioCompletionRate ?? 0}%
                </div>
              )}
              <p className='text-xs text-gray-500 mt-1'>Weighted average completion</p>
            </div>
          </div>

          {/* Metric 4: 30-Day Active Learners */}
          <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium text-gray-500'>30-Day Active Learners</span>
              <div className='w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center'>
                <Sparkles className='w-5 h-5' />
              </div>
            </div>
            <div className='mt-4'>
              {isLoadingAnalytics ? (
                <div className='h-8 w-16 bg-gray-200 animate-pulse rounded-md' />
              ) : (
                <div className='text-3xl font-extrabold text-gray-900'>
                  {analyticsOverview?.activeLearners30d ?? 0}
                </div>
              )}
              <p className='text-xs text-gray-500 mt-1'>Students active in past month</p>
            </div>
          </div>
        </div>
      </div>

      {/* Course Performance Breakdown Table */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4'>
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-4'>
          <div>
            <h2 className='text-lg font-bold text-gray-900'>Course Performance & Analytics</h2>
            <p className='text-xs text-gray-500'>
              Detailed breakdown of enrollment figures, completions, and syllabus progress per course.
            </p>
          </div>
          <Link
            href='/instructor/courses'
            className='text-xs font-semibold text-primary hover:underline flex items-center gap-1'
          >
            <span>Manage All Courses</span>
            <ArrowRight className='w-3.5 h-3.5' />
          </Link>
        </div>

        {isLoadingAnalytics ? (
          <div className='space-y-3 py-2'>
            {[1, 2, 3].map((i) => (
              <div key={i} className='h-14 bg-gray-100 rounded-xl animate-pulse' />
            ))}
          </div>
        ) : isAnalyticsError ? (
          <div className='p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 flex items-center justify-between'>
            <div className='flex items-center gap-2 text-xs font-medium'>
              <AlertCircle className='w-4 h-4' />
              <span>Failed to load course breakdown metrics.</span>
            </div>
            <Button variant='outline' size='sm' onClick={() => refetchAnalytics()}>
              Retry
            </Button>
          </div>
        ) : courseBreakdowns.length === 0 ? (
          <div className='text-center py-8 text-gray-500 text-xs'>
            <BarChart3 className='w-8 h-8 text-gray-400 mx-auto mb-2' />
            <p className='font-medium text-gray-700'>No course analytics recorded yet.</p>
            <p className='text-gray-400 mt-0.5'>
              Once courses are published and students enroll, breakdown metrics will appear here.
            </p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200 text-xs text-left'>
              <thead className='bg-gray-50/75 text-gray-700 font-semibold'>
                <tr>
                  <th scope='col' className='px-4 py-3'>
                    Course Title
                  </th>
                  <th scope='col' className='px-4 py-3 text-center'>
                    Status
                  </th>
                  <th scope='col' className='px-4 py-3 text-center'>
                    Enrolled
                  </th>
                  <th scope='col' className='px-4 py-3 text-center'>
                    Completions
                  </th>
                  <th scope='col' className='px-4 py-3 min-w-[140px]'>
                    Completion Rate
                  </th>
                  <th scope='col' className='px-4 py-3 text-center'>
                    Avg Progress
                  </th>
                  <th scope='col' className='px-4 py-3 text-right'>
                    Deep-Dive Actions
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100 bg-white'>
                {courseBreakdowns.map((item) => {
                  const statusBadgeStyles = {
                    DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
                    IN_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200',
                    PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    ARCHIVED: 'bg-slate-50 text-slate-700 border-slate-200',
                  }[item.status] || 'bg-gray-50 text-gray-700 border-gray-200';

                  return (
                    <tr key={item.courseId} className='hover:bg-gray-50/75 transition-colors'>
                      <td className='px-4 py-3'>
                        <div className='font-semibold text-gray-900 truncate max-w-xs'>
                          {item.title}
                        </div>
                        <div className='text-[11px] text-gray-400 font-mono truncate'>
                          /{item.slug}
                        </div>
                      </td>

                      <td className='px-4 py-3 text-center'>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${statusBadgeStyles}`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td className='px-4 py-3 text-center font-semibold text-gray-900'>
                        {item.totalEnrolled}
                      </td>

                      <td className='px-4 py-3 text-center font-semibold text-gray-900'>
                        {item.completedCount}
                      </td>

                      <td className='px-4 py-3'>
                        <div className='space-y-1'>
                          <div className='flex items-center justify-between text-xs font-semibold text-gray-700'>
                            <span>{item.completionRate}%</span>
                          </div>
                          <div className='w-full bg-gray-100 h-1.5 rounded-full overflow-hidden'>
                            <div
                              className='bg-purple-600 h-full rounded-full transition-all duration-300'
                              style={{ width: `${Math.min(item.completionRate, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className='px-4 py-3 text-center font-medium text-gray-700'>
                        {item.averageProgressPercentage}%
                      </td>

                      <td className='px-4 py-3 text-right'>
                        <div className='flex items-center justify-end gap-2'>
                          <Link href={`/instructor/courses/${item.courseId}/analytics`}>
                            <Button
                              variant='outline'
                              size='sm'
                              className='h-7 text-xs text-purple-700 border-purple-200 hover:bg-purple-50 flex items-center gap-1'
                            >
                              <BarChart3 className='w-3 h-3' />
                              <span>Analytics</span>
                            </Button>
                          </Link>
                          <Link href={`/instructor/courses/${item.courseId}/learners`}>
                            <Button
                              variant='outline'
                              size='sm'
                              className='h-7 text-xs text-blue-700 border-blue-200 hover:bg-blue-50 flex items-center gap-1'
                            >
                              <Users className='w-3 h-3' />
                              <span>Learners</span>
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Course Portfolio Status Metric Grid */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5'>
        {/* Metric 1: Published Courses */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium text-gray-500'>Active Courses</span>
            <div className='w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center'>
              <BookOpen className='w-5 h-5' />
            </div>
          </div>
          <div className='mt-4'>
            {isLoadingCourses ? (
              <div className='h-8 w-16 bg-gray-200 animate-pulse rounded-md' />
            ) : (
              <div className='text-3xl font-extrabold text-gray-900'>{publishedCount}</div>
            )}
            <p className='text-xs text-gray-500 mt-1'>Live in the public catalog</p>
          </div>
        </div>

        {/* Metric 2: Draft Courses */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium text-gray-500'>Draft Courses</span>
            <div className='w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center'>
              <FileEdit className='w-5 h-5' />
            </div>
          </div>
          <div className='mt-4'>
            {isLoadingCourses ? (
              <div className='h-8 w-16 bg-gray-200 animate-pulse rounded-md' />
            ) : (
              <div className='text-3xl font-extrabold text-gray-900'>{draftCount}</div>
            )}
            <p className='text-xs text-gray-500 mt-1'>Curriculum in development</p>
          </div>
        </div>

        {/* Metric 3: Under Review */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium text-gray-500'>Under Review</span>
            <div className='w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center'>
              <Clock className='w-5 h-5' />
            </div>
          </div>
          <div className='mt-4'>
            {isLoadingCourses ? (
              <div className='h-8 w-16 bg-gray-200 animate-pulse rounded-md' />
            ) : (
              <div className='text-3xl font-extrabold text-blue-600'>{inReviewCount}</div>
            )}
            <p className='text-xs text-gray-500 mt-1'>Pending admin review</p>
          </div>
        </div>

        {/* Metric 4: Total Portfolio */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium text-gray-500'>Total Portfolio</span>
            <div className='w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center'>
              <GraduationCap className='w-5 h-5' />
            </div>
          </div>
          <div className='mt-4'>
            {isLoadingCourses ? (
              <div className='h-8 w-16 bg-gray-200 animate-pulse rounded-md' />
            ) : (
              <div className='text-3xl font-extrabold text-gray-900'>{totalCourses}</div>
            )}
            <p className='text-xs text-gray-500 mt-1'>Total authored courses</p>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Cards */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div>
            <div className='w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4'>
              <BookOpen className='w-5 h-5' />
            </div>
            <h3 className='text-lg font-bold text-gray-900'>My Teaching Courses</h3>
            <p className='text-sm text-gray-600 mt-2'>
              View all your authored courses, organize modules and lessons, and inspect learner rosters and analytics.
            </p>
          </div>
          <div className='mt-6'>
            <Link
              href='/instructor/courses'
              className='inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline'
            >
              <span>Go to Courses</span>
              <ArrowRight className='w-4 h-4' />
            </Link>
          </div>
        </div>

        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div>
            <div className='w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4'>
              <Sparkles className='w-5 h-5' />
            </div>
            <h3 className='text-lg font-bold text-gray-900'>Course Authoring Wizard</h3>
            <p className='text-sm text-gray-600 mt-2'>
              Create a new course draft, set pricing in BDT, select academic categories, and design your syllabus.
            </p>
          </div>
          <div className='mt-6'>
            <Link
              href='/admin/courses/new'
              className='inline-flex items-center gap-2 text-sm font-semibold text-amber-600 hover:underline'
            >
              <span>Draft a New Course</span>
              <ArrowRight className='w-4 h-4' />
            </Link>
          </div>
        </div>

        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
          <div>
            <div className='w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4'>
              <Users className='w-5 h-5' />
            </div>
            <h3 className='text-lg font-bold text-gray-900'>Instructor Profile</h3>
            <p className='text-sm text-gray-600 mt-2'>
              View your educator account details, verified credentials, and institutional teaching affiliation.
            </p>
          </div>
          <div className='mt-6'>
            <Link
              href='/instructor/profile'
              className='inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:underline'
            >
              <span>View Profile</span>
              <ArrowRight className='w-4 h-4' />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
