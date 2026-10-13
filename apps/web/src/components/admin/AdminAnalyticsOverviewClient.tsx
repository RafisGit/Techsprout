'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAdminAnalyticsOverview,
  fetchAdminCourseAnalytics,
  type AdminCourseAnalyticsItemDto,
} from '@/lib/api/admin-analytics';
import { AdminNav } from '@/components/admin/AdminNav';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  Users,
  Award,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FileEdit,
  ExternalLink,
  ShieldAlert,
  AlertCircle,
  Loader2,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';

type CourseStatusFilter = 'ALL' | 'PUBLISHED' | 'IN_REVIEW' | 'DRAFT' | 'ARCHIVED';
type SortField = 'enrollments' | 'completionRate' | 'title' | 'createdAt';

export function AdminAnalyticsOverviewClient() {
  // Query 1: Platform Overview Metrics
  const {
    data: overview,
    isLoading: isLoadingOverview,
    isFetching: isFetchingOverview,
    isError: isOverviewError,
    error: overviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['adminAnalyticsOverview'],
    queryFn: () => fetchAdminAnalyticsOverview(),
    staleTime: 60 * 1000,
  });

  // Query 2: Paginated Course Analytics Filters & State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CourseStatusFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortField>('enrollments');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page to 1 when filters change
  const prevFilterRef = useRef({ debouncedSearch, statusFilter, sortBy, sortOrder });
  useEffect(() => {
    if (
      prevFilterRef.current.debouncedSearch !== debouncedSearch ||
      prevFilterRef.current.statusFilter !== statusFilter ||
      prevFilterRef.current.sortBy !== sortBy ||
      prevFilterRef.current.sortOrder !== sortOrder
    ) {
      prevFilterRef.current = { debouncedSearch, statusFilter, sortBy, sortOrder };
      setPage(1);
    }
  }, [debouncedSearch, statusFilter, sortBy, sortOrder]);

  const apiStatus = statusFilter === 'ALL' ? undefined : statusFilter;
  const apiSearch = debouncedSearch.trim() || undefined;

  const {
    data: coursesData,
    isLoading: isLoadingCourses,
    isFetching: isFetchingCourses,
    isError: isCoursesError,
    error: coursesError,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ['adminCourseAnalytics', page, limit, apiSearch, apiStatus, sortBy, sortOrder],
    queryFn: () =>
      fetchAdminCourseAnalytics({
        page,
        limit,
        search: apiSearch,
        status: apiStatus,
        sortBy,
        sortOrder,
      }),
    staleTime: 30 * 1000,
  });

  const courseItems: AdminCourseAnalyticsItemDto[] = coursesData?.items || [];
  const pagination = coursesData?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  const handleSortToggle = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className='space-y-8'>
      {/* Top Admin Navigation Bar */}
      <AdminNav />

      {/* Header Banner */}
      <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4'>
        <div>
          <div className='flex items-center gap-2'>
            <h1 className='text-2xl font-bold text-gray-900 tracking-tight'>
              Institutional Platform Analytics
            </h1>
            {isFetchingOverview && !isLoadingOverview && (
              <span className='inline-flex items-center gap-1 text-[11px] text-gray-400 font-medium'>
                <Loader2 className='w-3 h-3 animate-spin text-primary' />
                <span>Refreshing...</span>
              </span>
            )}
          </div>
          <p className='text-xs text-gray-600 mt-1 max-w-3xl'>
            High-level overview of institutional learner growth, catalog completion rates, review queue turnaround times, and course performance metrics.
          </p>
        </div>

        <div className='flex items-center gap-3'>
          <Link href='/admin/courses/review-queue'>
            <Button variant='outline' size='sm' className='flex items-center gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50'>
              <ClipboardCheck className='w-4 h-4' />
              <span>Review Queue</span>
            </Button>
          </Link>
          <Link href='/admin/courses/new'>
            <Button size='sm' className='bg-primary text-white hover:bg-primary/90 flex items-center gap-1.5 shadow-xs'>
              <BookOpen className='w-4 h-4' />
              <span>Create Course</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Overview Error Banner */}
      {isOverviewError && (
        <div className='p-5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-4 text-rose-800'>
          <div className='flex items-center gap-3'>
            <AlertCircle className='w-5 h-5 text-rose-600 flex-shrink-0' />
            <div>
              <h4 className='text-sm font-bold'>Unable to load platform analytics</h4>
              <p className='text-xs text-rose-700 mt-0.5'>
                {(overviewError as any)?.response?.data?.message || 'Failed to fetch platform metrics.'}
              </p>
            </div>
          </div>
          <Button variant='outline' size='sm' onClick={() => refetchOverview()} className='text-xs text-rose-800 border-rose-300'>
            Retry
          </Button>
        </div>
      )}

      {/* Section 1: Executive KPI Metrics Grid */}
      <div className='space-y-3'>
        <h2 className='text-base font-bold text-gray-900'>Platform Learning Totals</h2>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4'>
          {/* Metric 1: Registered Students */}
          <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold text-gray-500'>Registered Students</span>
              <div className='w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center'>
                <Users className='w-4 h-4' />
              </div>
            </div>
            <div className='mt-3'>
              {isLoadingOverview ? (
                <div className='h-8 w-16 bg-gray-200 rounded animate-pulse' />
              ) : (
                <div className='text-2xl font-extrabold text-gray-900'>{overview?.totalRegisteredStudents ?? 0}</div>
              )}
              <p className='text-[11px] text-gray-400 mt-0.5'>Active student accounts</p>
            </div>
          </div>

          {/* Metric 2: Active Instructors */}
          <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold text-gray-500'>Active Instructors</span>
              <div className='w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center'>
                <BookOpen className='w-4 h-4' />
              </div>
            </div>
            <div className='mt-3'>
              {isLoadingOverview ? (
                <div className='h-8 w-16 bg-gray-200 rounded animate-pulse' />
              ) : (
                <div className='text-2xl font-extrabold text-gray-900'>{overview?.totalActiveInstructors ?? 0}</div>
              )}
              <p className='text-[11px] text-gray-400 mt-0.5'>Verified educators</p>
            </div>
          </div>

          {/* Metric 3: Platform Enrollments */}
          <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold text-gray-500'>Total Enrollments</span>
              <div className='w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center'>
                <Layers className='w-4 h-4' />
              </div>
            </div>
            <div className='mt-3'>
              {isLoadingOverview ? (
                <div className='h-8 w-16 bg-gray-200 rounded animate-pulse' />
              ) : (
                <div className='text-2xl font-extrabold text-gray-900'>{overview?.platformWideEnrollments ?? 0}</div>
              )}
              <p className='text-[11px] text-gray-400 mt-0.5'>Cumulative enrollments</p>
            </div>
          </div>

          {/* Metric 4: Platform Certificates */}
          <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold text-gray-500'>Certificates Issued</span>
              <div className='w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center'>
                <Award className='w-4 h-4' />
              </div>
            </div>
            <div className='mt-3'>
              {isLoadingOverview ? (
                <div className='h-8 w-16 bg-gray-200 rounded animate-pulse' />
              ) : (
                <div className='text-2xl font-extrabold text-gray-900'>{overview?.platformWideCertificates ?? 0}</div>
              )}
              <p className='text-[11px] text-gray-400 mt-0.5'>Completed courses</p>
            </div>
          </div>

          {/* Metric 5: Platform Completion Rate */}
          <div className='p-5 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-semibold text-gray-500'>Completion Rate</span>
              <div className='w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center'>
                <TrendingUp className='w-4 h-4' />
              </div>
            </div>
            <div className='mt-3'>
              {isLoadingOverview ? (
                <div className='h-8 w-16 bg-gray-200 rounded animate-pulse' />
              ) : (
                <div className='text-2xl font-extrabold text-gray-900'>{overview?.platformCompletionRate ?? 0}%</div>
              )}
              <p className='text-[11px] text-gray-400 mt-0.5'>Across all courses</p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Course Lifecycle & Review Queue SLAs */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        {/* Card: Course Lifecycle Status Breakdown */}
        <div className='lg:col-span-2 p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-base font-bold text-gray-900'>Catalog Course Lifecycle</h3>
            <span className='text-xs text-gray-400 font-mono'>
              Total{' '}
              {(overview?.totalPublishedCourses ?? 0) +
                (overview?.totalInReviewCourses ?? 0) +
                (overview?.totalDraftCourses ?? 0) +
                (overview?.totalArchivedCourses ?? 0)}{' '}
              Courses
            </span>
          </div>

          <div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
            {/* Published */}
            <div className='p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 flex flex-col justify-between'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-bold text-emerald-800'>Published</span>
                <span className='w-2 h-2 rounded-full bg-emerald-500' />
              </div>
              <div className='mt-3'>
                <div className='text-2xl font-extrabold text-emerald-900'>
                  {overview?.totalPublishedCourses ?? 0}
                </div>
                <p className='text-[10px] text-emerald-700 mt-0.5'>Live in catalog</p>
              </div>
            </div>

            {/* In Review */}
            <div className='p-4 rounded-xl border border-blue-100 bg-blue-50/40 flex flex-col justify-between'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-bold text-blue-800'>In Review</span>
                <span className='w-2 h-2 rounded-full bg-blue-500' />
              </div>
              <div className='mt-3'>
                <div className='text-2xl font-extrabold text-blue-900'>
                  {overview?.totalInReviewCourses ?? 0}
                </div>
                <p className='text-[10px] text-blue-700 mt-0.5'>Pending approval</p>
              </div>
            </div>

            {/* Draft */}
            <div className='p-4 rounded-xl border border-amber-100 bg-amber-50/40 flex flex-col justify-between'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-bold text-amber-800'>Draft</span>
                <span className='w-2 h-2 rounded-full bg-amber-500' />
              </div>
              <div className='mt-3'>
                <div className='text-2xl font-extrabold text-amber-900'>
                  {overview?.totalDraftCourses ?? 0}
                </div>
                <p className='text-[10px] text-amber-700 mt-0.5'>In authoring</p>
              </div>
            </div>

            {/* Archived */}
            <div className='p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col justify-between'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-bold text-slate-700'>Archived</span>
                <span className='w-2 h-2 rounded-full bg-slate-400' />
              </div>
              <div className='mt-3'>
                <div className='text-2xl font-extrabold text-slate-800'>
                  {overview?.totalArchivedCourses ?? 0}
                </div>
                <p className='text-[10px] text-slate-500 mt-0.5'>Retired offerings</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Review Queue SLA & Turnaround */}
        <div className='p-6 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col justify-between space-y-4'>
          <div>
            <div className='flex items-center justify-between'>
              <h3 className='text-base font-bold text-gray-900'>Review Queue SLA</h3>
              <div className='w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center'>
                <Clock className='w-4 h-4' />
              </div>
            </div>
            <p className='text-xs text-gray-500 mt-1'>
              Turnaround duration for instructor curriculum review submissions.
            </p>

            <div className='mt-5 space-y-4'>
              <div className='flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100'>
                <div>
                  <span className='text-xs font-semibold text-gray-700'>Pending Reviews</span>
                  <p className='text-[11px] text-gray-400'>Courses awaiting moderation</p>
                </div>
                <span className='text-xl font-extrabold text-primary'>
                  {overview?.reviewQueue.pendingReviewsCount ?? 0}
                </span>
              </div>

              <div className='flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100'>
                <div>
                  <span className='text-xs font-semibold text-gray-700'>Avg Turnaround</span>
                  <p className='text-[11px] text-gray-400'>Submission to review decision</p>
                </div>
                <span className='text-xl font-extrabold text-gray-900'>
                  {overview?.reviewQueue.averageTurnaroundHours != null
                    ? `${overview.reviewQueue.averageTurnaroundHours}h`
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <div className='pt-2'>
            <Link href='/admin/courses/review-queue'>
              <Button variant='outline' size='sm' className='w-full text-xs font-semibold flex items-center justify-center gap-1.5'>
                <span>Open Review Queue</span>
                <ArrowRight className='w-3.5 h-3.5' />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Section 3: Paginated Catalog Course Analytics Rollup */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden space-y-0'>
        {/* Table Header & Controls */}
        <div className='p-6 border-b border-gray-100 space-y-4'>
          <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
            <div>
              <h2 className='text-lg font-bold text-gray-900'>Catalog Course Analytics</h2>
              <p className='text-xs text-gray-500 mt-0.5'>
                Search and analyze student enrollments and completion rates across the entire institutional catalog.
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-xs text-gray-500 font-medium'>
                {pagination.total} {pagination.total === 1 ? 'course' : 'courses'} total
              </span>
            </div>
          </div>

          {/* Filter Bar: Search, Status Tabs, Sorting */}
          <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-2'>
            {/* Search Input */}
            <div className='relative min-w-[280px] max-w-md flex-1'>
              <Search className='w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' />
              <input
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search courses by title...'
                className='w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary'
              />
              {searchQuery && (
                <button
                  type='button'
                  onClick={() => setSearchQuery('')}
                  className='text-[11px] text-gray-400 hover:text-gray-700 absolute right-3 top-1/2 -translate-y-1/2'
                >
                  Clear
                </button>
              )}
            </div>

            {/* Status Filter Tabs */}
            <div className='flex flex-wrap items-center gap-1 bg-gray-100 p-1 rounded-xl text-xs font-semibold'>
              {(
                [
                  { key: 'ALL', label: 'All Statuses' },
                  { key: 'PUBLISHED', label: 'Published' },
                  { key: 'IN_REVIEW', label: 'In Review' },
                  { key: 'DRAFT', label: 'Draft' },
                  { key: 'ARCHIVED', label: 'Archived' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type='button'
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    statusFilter === tab.key
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div className='flex items-center gap-2 text-xs'>
              <span className='text-gray-500 font-medium'>Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortField)}
                className='bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 font-medium focus:ring-2 focus:ring-primary focus:outline-none'
              >
                <option value='enrollments'>Enrollments</option>
                <option value='completionRate'>Completion Rate</option>
                <option value='title'>Title</option>
                <option value='createdAt'>Creation Date</option>
              </select>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className='h-8 px-2 text-xs text-gray-700'
                title={`Sort Order: ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                <ArrowUpDown className='w-3.5 h-3.5 mr-1' />
                <span className='uppercase text-[10px] font-bold'>{sortOrder}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Courses Table Content */}
        {isLoadingCourses ? (
          <div className='p-6 space-y-4'>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className='h-12 bg-gray-100 rounded-xl animate-pulse' />
            ))}
          </div>
        ) : isCoursesError ? (
          <div className='p-8 text-center space-y-3'>
            <AlertCircle className='w-8 h-8 text-rose-500 mx-auto' />
            <h4 className='text-sm font-bold text-gray-900'>Unable to load course analytics</h4>
            <p className='text-xs text-gray-500 max-w-md mx-auto'>
              {(coursesError as any)?.response?.data?.message || 'Failed to retrieve course rollup data.'}
            </p>
            <Button variant='outline' size='sm' onClick={() => refetchCourses()} className='text-xs'>
              Retry
            </Button>
          </div>
        ) : courseItems.length === 0 ? (
          <div className='p-12 text-center space-y-3'>
            <BookOpen className='w-10 h-10 text-gray-300 mx-auto' />
            <h4 className='text-sm font-bold text-gray-800'>No courses found</h4>
            <p className='text-xs text-gray-500 max-w-sm mx-auto'>
              {debouncedSearch
                ? `No courses matched your query "${debouncedSearch}". Try broadening your search or clearing filters.`
                : 'No course analytics available under the selected status filter.'}
            </p>
            {(debouncedSearch || statusFilter !== 'ALL') && (
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setSearchQuery('');
                  setDebouncedSearch('');
                  setStatusFilter('ALL');
                }}
                className='text-xs mt-2'
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200 text-xs text-left'>
              <thead className='bg-gray-50/75 text-gray-700 font-semibold'>
                <tr>
                  <th scope='col' className='px-4 py-3'>
                    Course Title
                  </th>
                  <th scope='col' className='px-4 py-3'>
                    Instructor
                  </th>
                  <th scope='col' className='px-4 py-3 text-center'>
                    Status
                  </th>
                  <th
                    scope='col'
                    onClick={() => handleSortToggle('enrollments')}
                    className='px-4 py-3 text-center cursor-pointer hover:bg-gray-100 transition-colors'
                  >
                    <div className='flex items-center justify-center gap-1'>
                      <span>Enrolled</span>
                      {sortBy === 'enrollments' && (
                        <span className='font-mono text-[10px]'>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th scope='col' className='px-4 py-3 text-center'>
                    Completions
                  </th>
                  <th
                    scope='col'
                    onClick={() => handleSortToggle('completionRate')}
                    className='px-4 py-3 min-w-[150px] cursor-pointer hover:bg-gray-100 transition-colors'
                  >
                    <div className='flex items-center gap-1'>
                      <span>Completion Rate</span>
                      {sortBy === 'completionRate' && (
                        <span className='font-mono text-[10px]'>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th scope='col' className='px-4 py-3 text-right'>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100 bg-white'>
                {courseItems.map((course) => {
                  const statusBadgeStyles = {
                    DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
                    IN_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200',
                    PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    ARCHIVED: 'bg-slate-50 text-slate-700 border-slate-200',
                  }[course.status] || 'bg-gray-50 text-gray-700 border-gray-200';

                  return (
                    <tr key={course.courseId} className='hover:bg-gray-50/75 transition-colors'>
                      {/* Course Title & Category */}
                      <td className='px-4 py-3'>
                        <div className='font-semibold text-gray-900 truncate max-w-xs' title={course.title}>
                          {course.title}
                        </div>
                        <div className='text-[11px] text-gray-400 mt-0.5 flex items-center gap-2'>
                          <span>{course.category?.name || 'Uncategorized'}</span>
                          <span>&bull;</span>
                          <span className='font-mono'>/{course.slug}</span>
                        </div>
                      </td>

                      {/* Instructor Info */}
                      <td className='px-4 py-3'>
                        <div className='font-medium text-gray-800'>{course.instructor.name}</div>
                        <div className='text-[11px] text-gray-400 font-mono'>{course.instructor.email}</div>
                      </td>

                      {/* Status */}
                      <td className='px-4 py-3 text-center'>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${statusBadgeStyles}`}>
                          {course.status}
                        </span>
                      </td>

                      {/* Enrolled Count */}
                      <td className='px-4 py-3 text-center font-bold text-gray-900'>
                        {course.totalEnrolled}
                      </td>

                      {/* Completed Count */}
                      <td className='px-4 py-3 text-center font-semibold text-gray-700'>
                        {course.completedCount}
                      </td>

                      {/* Completion Rate */}
                      <td className='px-4 py-3'>
                        <div className='space-y-1'>
                          <div className='flex items-center justify-between text-xs font-bold text-gray-800'>
                            <span>{course.completionRate}%</span>
                          </div>
                          <div className='w-full bg-gray-100 h-2 rounded-full overflow-hidden'>
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                course.completionRate >= 60
                                  ? 'bg-emerald-500'
                                  : course.completionRate >= 30
                                  ? 'bg-blue-500'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(course.completionRate, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className='px-4 py-3 text-right'>
                        <div className='flex items-center justify-end gap-1.5'>
                          <Link href={`/admin/courses/${course.courseId}`}>
                            <Button
                              variant='outline'
                              size='sm'
                              className='h-7 text-xs px-2.5 text-gray-700 hover:text-gray-900'
                              title='Edit Curriculum'
                            >
                              <FileEdit className='w-3 h-3 mr-1' />
                              <span>Curriculum</span>
                            </Button>
                          </Link>

                          <Link href={`/instructor/courses/${course.courseId}/learners`}>
                            <Button
                              variant='outline'
                              size='sm'
                              className='h-7 text-xs px-2.5 text-blue-700 border-blue-200 hover:bg-blue-50'
                              title='View Enrolled Learners'
                            >
                              <Users className='w-3 h-3 mr-1' />
                              <span>Learners</span>
                            </Button>
                          </Link>

                          {course.status === 'PUBLISHED' && (
                            <Link href={`/courses/${course.slug}`} target='_blank' rel='noopener noreferrer'>
                              <Button
                                variant='ghost'
                                size='sm'
                                className='h-7 text-xs px-2 text-emerald-700 hover:bg-emerald-50'
                                title='View Live Catalog Listing'
                              >
                                <ExternalLink className='w-3 h-3' />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className='p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 bg-gray-50/50'>
            <span>
              Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total} matching courses)
            </span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={!pagination.hasPreviousPage}
                className='text-xs h-8'
              >
                <ChevronLeft className='w-3.5 h-3.5 mr-1' />
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                disabled={!pagination.hasNextPage}
                className='text-xs h-8'
              >
                Next
                <ChevronRight className='w-3.5 h-3.5 ml-1' />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
