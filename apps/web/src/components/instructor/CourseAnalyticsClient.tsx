'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  fetchInstructorCourseById,
  fetchCourseAnalytics,
  fetchCourseRetentionAnalytics,
  type CourseAnalyticsDetailDto,
} from '@/lib/api/instructor';
import { TrendLineChart } from '@/components/analytics/TrendLineChart';
import { ProgressDistributionBar } from '@/components/analytics/ProgressDistributionBar';
import { DropOffTable } from '@/components/analytics/DropOffTable';
import { QuizSummaryCard } from '@/components/analytics/QuizSummaryCard';
import { VideoRetentionCurve } from '@/components/analytics/VideoRetentionCurve';
import {
  AnalyticsDateRangeControls,
  type DateRangeFilterState,
} from '@/components/analytics/AnalyticsDateRangeControls';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  FileEdit,
  AlertCircle,
  ShieldAlert,
  Loader2,
  BarChart3,
  Calendar,
  Sparkles,
} from 'lucide-react';

interface CourseAnalyticsClientProps {
  courseId: string;
}

function getDefaultDateRange(): DateRangeFilterState {
  const now = new Date();
  const past30 = new Date(now);
  past30.setDate(now.getDate() - 30);

  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    startDate: format(past30),
    endDate: format(now),
    interval: 'day',
  };
}

export function CourseAnalyticsClient({ courseId }: CourseAnalyticsClientProps) {
  const [filterState, setFilterState] = useState<DateRangeFilterState>(getDefaultDateRange());

  // Fetch course metadata
  const {
    data: course,
    isLoading: isLoadingCourse,
    isError: isCourseError,
  } = useQuery({
    queryKey: ['instructorCourse', courseId],
    queryFn: () => fetchInstructorCourseById(courseId),
    enabled: !!courseId,
  });

  // Fetch course analytics
  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    isFetching: isFetchingAnalytics,
    isError: isAnalyticsError,
    error: analyticsError,
    refetch,
  } = useQuery({
    queryKey: [
      'courseAnalytics',
      courseId,
      filterState.startDate,
      filterState.endDate,
      filterState.interval,
    ],
    queryFn: () =>
      fetchCourseAnalytics(courseId, {
        startDate: filterState.startDate,
        endDate: filterState.endDate,
        interval: filterState.interval,
      }),
    enabled: !!courseId,
    staleTime: 30 * 1000,
  });

  // Fetch video retention analytics (WP-P7-02)
  const { data: retentionData } = useQuery({
    queryKey: ['courseRetention', courseId, filterState.startDate, filterState.endDate],
    queryFn: () =>
      fetchCourseRetentionAnalytics(courseId, {
        startDate: filterState.startDate,
        endDate: filterState.endDate,
      }),
    enabled: !!courseId,
    staleTime: 60 * 1000,
  });

  // Error Status Code Check
  const errorStatus = (analyticsError as { response?: { status?: number } })?.response?.status;
  const isUnauthorized = errorStatus === 401;
  const isForbidden = errorStatus === 403;
  const isNotFound = errorStatus === 404;

  const errorMessage =
    (analyticsError as { response?: { data?: { message?: string } } })?.response?.data?.message ||
    (analyticsError as { message?: string })?.message ||
    'Failed to load course analytics.';

  return (
    <div className='space-y-6'>
      {/* Top Breadcrumb & Action Banner */}
      <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4'>
        <div className='space-y-1'>
          <div className='flex items-center gap-2 text-xs text-gray-500 mb-1'>
            <Link
              href='/instructor/courses'
              className='hover:text-primary transition-colors flex items-center gap-1 font-medium'
            >
              <ArrowLeft className='w-3.5 h-3.5' />
              <span>Back to Teaching Courses</span>
            </Link>
            <span>/</span>
            <span className='text-gray-700 font-semibold truncate max-w-xs'>
              {course?.title || analytics?.courseTitle || 'Course'}
            </span>
            <span>/</span>
            <span className='text-primary font-semibold'>Analytics</span>
          </div>

          <div className='flex items-center gap-3'>
            <h1 className='text-2xl font-bold text-gray-900 tracking-tight'>
              Course Analytics & Performance
            </h1>
            {course?.status && (
              <span className='px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200'>
                {course.status}
              </span>
            )}
            {isFetchingAnalytics && !isLoadingAnalytics && (
              <span className='inline-flex items-center gap-1 text-[11px] text-gray-400 font-medium'>
                <Loader2 className='w-3 h-3 animate-spin text-primary' />
                <span>Refreshing...</span>
              </span>
            )}
          </div>
          <p className='text-xs text-gray-600 mt-0.5 max-w-2xl'>
            Evaluate student enrollment growth, syllabus completion rates, lesson drop-off trends, and quiz performance.
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2.5 flex-shrink-0'>
          <Link href={`/instructor/courses/${courseId}/learners`}>
            <Button
              variant='outline'
              size='sm'
              className='flex items-center gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50'
            >
              <Users className='w-4 h-4' />
              <span>Learner Roster</span>
            </Button>
          </Link>

          <Link href={`/admin/courses/${courseId}`}>
            <Button variant='outline' size='sm' className='flex items-center gap-1.5'>
              <FileEdit className='w-4 h-4' />
              <span>Edit Curriculum</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Date Range & Interval Controls */}
      <AnalyticsDateRangeControls value={filterState} onChange={setFilterState} />

      {/* Error State Banner */}
      {isAnalyticsError && (
        <div className='p-6 bg-white rounded-2xl border border-rose-200 shadow-xs'>
          <div className='flex items-start gap-3'>
            <div className='p-2 bg-rose-50 text-rose-600 rounded-xl flex-shrink-0'>
              <AlertCircle className='w-5 h-5' />
            </div>
            <div className='space-y-1 flex-1'>
              <h3 className='text-sm font-bold text-gray-900'>
                {isForbidden
                  ? 'Access Forbidden'
                  : isNotFound
                  ? 'Course Analytics Not Found'
                  : isUnauthorized
                  ? 'Authentication Required'
                  : 'Analytics Service Error'}
              </h3>
              <p className='text-xs text-gray-600'>
                {isForbidden
                  ? 'You do not own or have permission to access analytics for this course.'
                  : isNotFound
                  ? 'The requested course does not exist or has been removed.'
                  : isUnauthorized
                  ? 'Please sign in as an authorized instructor to view this analytics report.'
                  : errorMessage}
              </p>
              <div className='pt-2'>
                <Button variant='outline' size='sm' onClick={() => refetch()} className='text-xs'>
                  Retry Analytics Request
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoadingAnalytics && (
        <div className='space-y-6 animate-pulse'>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4'>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className='h-24 bg-gray-100 rounded-2xl' />
            ))}
          </div>
          <div className='h-64 bg-gray-100 rounded-2xl' />
          <div className='h-48 bg-gray-100 rounded-2xl' />
        </div>
      )}

      {/* Analytics Content */}
      {!isLoadingAnalytics && analytics && (
        <div className='space-y-6'>
          {/* Small Cohort Privacy Notice (DEC-P6.3-09) */}
          {analytics.metrics.totalEnrolled < 5 && (
            <div className='p-4 bg-amber-50/75 border border-amber-200 rounded-2xl flex items-start gap-3'>
              <ShieldAlert className='w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5' />
              <div className='text-xs text-amber-900'>
                <span className='font-bold'>Privacy Notice (Small Cohort):</span> This course has{' '}
                {analytics.metrics.totalEnrolled}{' '}
                {analytics.metrics.totalEnrolled === 1 ? 'enrolled learner' : 'enrolled learners'}.
                With fewer than 5 learners, individual performance is aggregated to maintain learner
                privacy. Sequential drop-off rates and completion averages should be interpreted
                cautiously due to small sample size.
              </div>
            </div>
          )}

          {/* Metric KPI Cards */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4'>
            {/* Total Enrolled */}
            <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-medium text-gray-500'>Total Enrolled</span>
                <div className='w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center'>
                  <Users className='w-4 h-4' />
                </div>
              </div>
              <div className='mt-3'>
                <div className='text-2xl font-extrabold text-gray-900'>
                  {analytics.metrics.totalEnrolled}
                </div>
                <p className='text-[11px] text-gray-400 mt-0.5'>Cumulative enrollments</p>
              </div>
            </div>

            {/* Course Completions */}
            <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-medium text-gray-500'>Completions</span>
                <div className='w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center'>
                  <CheckCircle2 className='w-4 h-4' />
                </div>
              </div>
              <div className='mt-3'>
                <div className='text-2xl font-extrabold text-gray-900'>
                  {analytics.metrics.totalCompleted}
                </div>
                <p className='text-[11px] text-gray-400 mt-0.5'>Finished all lessons</p>
              </div>
            </div>

            {/* Completion Rate */}
            <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-medium text-gray-500'>Completion Rate</span>
                <div className='w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center'>
                  <TrendingUp className='w-4 h-4' />
                </div>
              </div>
              <div className='mt-3'>
                <div className='text-2xl font-extrabold text-gray-900'>
                  {analytics.metrics.completionRate}%
                </div>
                <p className='text-[11px] text-gray-400 mt-0.5'>Of enrolled students</p>
              </div>
            </div>

            {/* Avg Days to Complete */}
            <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-medium text-gray-500'>Avg Duration</span>
                <div className='w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center'>
                  <Clock className='w-4 h-4' />
                </div>
              </div>
              <div className='mt-3'>
                <div className='text-2xl font-extrabold text-gray-900'>
                  {analytics.metrics.averageDaysToComplete != null
                    ? `${analytics.metrics.averageDaysToComplete}d`
                    : 'N/A'}
                </div>
                <p className='text-[11px] text-gray-400 mt-0.5'>
                  {analytics.metrics.averageDaysToComplete != null
                    ? 'Days from enrollment'
                    : 'Insufficient data'}
                </p>
              </div>
            </div>

            {/* Active Learners (30d) */}
            <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-medium text-gray-500'>30-Day Active</span>
                <div className='w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center'>
                  <Sparkles className='w-4 h-4' />
                </div>
              </div>
              <div className='mt-3'>
                <div className='text-2xl font-extrabold text-gray-900'>
                  {analytics.metrics.activeLearners30d}
                </div>
                <p className='text-[11px] text-gray-400 mt-0.5'>Engaged last 30 days</p>
              </div>
            </div>
          </div>

          {/* Section 1: Enrollment Growth Trend */}
          <TrendLineChart
            data={analytics.enrollmentTrend}
            title='Course Enrollment Trend'
            interval={filterState.interval}
          />

          {/* Section 2: Progress Distribution Breakdown */}
          <ProgressDistributionBar
            distribution={analytics.progressDistribution}
            totalLearners={analytics.metrics.totalEnrolled}
          />

          {/* Section 3: Sequential Drop-Off Table */}
          <DropOffTable
            items={analytics.lessonDropOff}
            totalEnrolled={analytics.metrics.totalEnrolled}
          />

          {/* Section 4: Quiz & Assessment Performance */}
          <QuizSummaryCard quizzes={analytics.quizPerformance} />

          {/* Section 5: Video Engagement Retention Curve & Rewind Heatmap (WP-P7-02) */}
          {retentionData && (
            <VideoRetentionCurve data={retentionData} />
          )}
        </div>
      )}
    </div>
  );
}
