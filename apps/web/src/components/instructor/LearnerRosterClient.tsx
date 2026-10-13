'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  fetchInstructorCourseById,
  fetchCourseEnrollments,
  type CourseEnrollmentItem,
  type EnrollmentStatus,
} from '@/lib/api/instructor';
import { LearnerRosterTable } from '@/components/instructor/LearnerRosterTable';
import { serializeRosterToCsv, generateRosterCsvFilename, downloadCsvFile } from '@/lib/roster-csv';
import { Button } from '@/components/ui/button';
import {
  Users,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FileEdit,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface LearnerRosterClientProps {
  courseId: string;
}

export function LearnerRosterClient({ courseId }: LearnerRosterClientProps) {
  const [page, setPage] = useState<number>(1);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const limit = 10;

  // Query Course metadata
  const {
    data: course,
    isLoading: isLoadingCourse,
    isError: isCourseError,
  } = useQuery({
    queryKey: ['instructorCourse', courseId],
    queryFn: () => fetchInstructorCourseById(courseId),
    enabled: !!courseId,
  });

  // Query Course Enrollments
  const statusParam = selectedStatus === 'ALL' ? undefined : (selectedStatus as EnrollmentStatus);
  const {
    data: enrollmentsData,
    isLoading: isLoadingEnrollments,
    isError: isEnrollmentsError,
    error: enrollmentsError,
    refetch,
  } = useQuery({
    queryKey: ['courseEnrollments', courseId, page, selectedStatus],
    queryFn: () =>
      fetchCourseEnrollments(courseId, {
        status: statusParam,
        page,
        limit,
      }),
    enabled: !!courseId,
  });

  const rawItems = enrollmentsData?.items || [];
  const pagination = enrollmentsData?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  const totalEnrolled = enrollmentsData?.totalEnrolled || 0;
  const completedCount = enrollmentsData?.completedCount || 0;
  const activeCount = Math.max(totalEnrolled - completedCount, 0);
  const completionRate = totalEnrolled > 0 ? Math.round((completedCount / totalEnrolled) * 100) : 0;

  // Filter rawItems by client-side search query (name or email)
  const filteredItems = rawItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.student.name.toLowerCase().includes(q) ||
      item.student.email.toLowerCase().includes(q)
    );
  });

  const handleStatusChange = (newStatus: string) => {
    setSelectedStatus(newStatus);
    setPage(1); // Reset page boundary when filter alters
  };

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      setExportError(null);

      let allExportItems: CourseEnrollmentItem[] = [];

      // If all items fit within the loaded page, export them directly
      if (pagination.totalPages <= 1) {
        allExportItems = rawItems;
      } else {
        // Fetch full matching roster iteratively with max limit (100) so no learners are omitted
        const fullFetchLimit = 100;
        const firstPageData = await fetchCourseEnrollments(courseId, {
          status: statusParam,
          page: 1,
          limit: fullFetchLimit,
        });

        allExportItems = [...firstPageData.items];
        const totalPagesToFetch = firstPageData.pagination.totalPages;

        for (let p = 2; p <= totalPagesToFetch; p++) {
          const nextPageData = await fetchCourseEnrollments(courseId, {
            status: statusParam,
            page: p,
            limit: fullFetchLimit,
          });
          allExportItems = allExportItems.concat(nextPageData.items);
        }
      }

      // If user has an active search filter, apply it to the export dataset as well
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        allExportItems = allExportItems.filter(
          (item) =>
            item.student.name.toLowerCase().includes(q) ||
            item.student.email.toLowerCase().includes(q)
        );
      }

      const csvContent = serializeRosterToCsv(allExportItems);
      const filename = generateRosterCsvFilename(course?.slug || courseId);
      downloadCsvFile(csvContent, filename);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to export learner roster to CSV';
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const statusTabs = [
    { label: 'All Enrollments', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

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
              {course?.title || 'Course'}
            </span>
          </div>

          <div className='flex items-center gap-3'>
            <h1 className='text-2xl font-bold text-gray-900 tracking-tight'>
              Course Learner Roster
            </h1>
            {course?.status && (
              <span className='px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200'>
                {course.status}
              </span>
            )}
          </div>
          <p className='text-xs text-gray-600 mt-0.5 max-w-2xl'>
            Monitor student enrollments, module completion rates, and individual learner progress for this course.
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2.5 flex-shrink-0'>
          <Link href={`/admin/courses/${courseId}`}>
            <Button variant='outline' size='sm' className='flex items-center gap-1.5'>
              <FileEdit className='w-4 h-4' />
              <span>Edit Curriculum</span>
            </Button>
          </Link>

          <Button
            size='sm'
            onClick={handleExportCsv}
            disabled={isExporting || totalEnrolled === 0}
            className='bg-primary text-white hover:bg-primary/90 flex items-center gap-1.5'
            title={totalEnrolled === 0 ? 'No students enrolled to export' : 'Download roster as RFC-4180 CSV'}
          >
            {isExporting ? (
              <Loader2 className='w-4 h-4 animate-spin' />
            ) : (
              <Download className='w-4 h-4' />
            )}
            <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
          </Button>
        </div>
      </div>

      {/* Export Error Banner */}
      {exportError && (
        <div className='p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <AlertCircle className='w-4 h-4 text-red-600 flex-shrink-0' />
            <span>{exportError}</span>
          </div>
          <button
            onClick={() => setExportError(null)}
            className='text-xs font-semibold hover:underline text-red-700'
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Metric Summary Cards */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
        <div className='bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between'>
          <div>
            <p className='text-xs text-gray-500 font-medium'>Total Enrolled</p>
            <h3 className='text-2xl font-bold text-gray-900 mt-1'>{totalEnrolled}</h3>
            <p className='text-[11px] text-gray-400 mt-0.5'>Cumulative enrollments</p>
          </div>
          <div className='w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0'>
            <Users className='w-5 h-5' />
          </div>
        </div>

        <div className='bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between'>
          <div>
            <p className='text-xs text-gray-500 font-medium'>Active Learners</p>
            <h3 className='text-2xl font-bold text-gray-900 mt-1'>{activeCount}</h3>
            <p className='text-[11px] text-emerald-600 font-medium mt-0.5'>Currently progressing</p>
          </div>
          <div className='w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0'>
            <Clock className='w-5 h-5' />
          </div>
        </div>

        <div className='bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between'>
          <div>
            <p className='text-xs text-gray-500 font-medium'>Completed Course</p>
            <h3 className='text-2xl font-bold text-gray-900 mt-1'>{completedCount}</h3>
            <p className='text-[11px] text-blue-600 font-medium mt-0.5'>100% curriculum finished</p>
          </div>
          <div className='w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0'>
            <CheckCircle2 className='w-5 h-5' />
          </div>
        </div>

        <div className='bg-white p-5 rounded-2xl border border-gray-200 shadow-xs flex items-center justify-between'>
          <div>
            <p className='text-xs text-gray-500 font-medium'>Completion Rate</p>
            <h3 className='text-2xl font-bold text-gray-900 mt-1'>{completionRate}%</h3>
            <p className='text-[11px] text-gray-400 mt-0.5'>Of enrolled students</p>
          </div>
          <div className='w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0'>
            <TrendingUp className='w-5 h-5' />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className='bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4'>
        {/* Status Filter Tabs */}
        <div className='flex items-center space-x-1 overflow-x-auto'>
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleStatusChange(tab.value)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                selectedStatus === tab.value
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className='relative min-w-[260px]'>
          <input
            type='text'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search by learner name or email...'
            className='w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary'
          />
          <Search className='w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' />
        </div>
      </div>

      {/* Roster Table Card */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
        <div className='p-4 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500'>
          <span>
            Showing <strong>{filteredItems.length}</strong> of <strong>{pagination.total}</strong> enrolled learners
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className='text-primary hover:underline font-medium'
            >
              Clear Search
            </button>
          )}
        </div>

        <LearnerRosterTable
          items={filteredItems}
          isLoading={isLoadingEnrollments}
          isError={isEnrollmentsError}
          errorMessage={
            (enrollmentsError as { response?: { data?: { message?: string } } })?.response?.data
              ?.message || null
          }
          onRetry={() => refetch()}
          searchQuery={searchQuery}
        />

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className='p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 bg-gray-50/50'>
            <span>
              Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total} learners total)
            </span>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={!pagination.hasPreviousPage}
              >
                <ChevronLeft className='w-4 h-4 mr-1' />
                Previous
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                disabled={!pagination.hasNextPage}
              >
                Next
                <ChevronRight className='w-4 h-4 ml-1' />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
