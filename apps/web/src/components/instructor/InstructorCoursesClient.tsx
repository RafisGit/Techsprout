'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchInstructorCourses } from '@/lib/api/instructor';
import { CourseReviewModal } from '@/components/instructor/CourseReviewModal';
import { ReviewWithdrawalModal } from '@/components/instructor/ReviewWithdrawalModal';
import { Button } from '@/components/ui/button';
import {
  PlusCircle,
  Search,
  BookOpen,
  Send,
  RotateCcw,
  FileEdit,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
} from 'lucide-react';
import type { CourseDto } from '@techsprout/contracts';

export function InstructorCoursesClient() {
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [reviewModalCourseId, setReviewModalCourseId] = useState<string | null>(null);
  const [withdrawModalCourse, setWithdrawModalCourse] = useState<CourseDto | null>(null);

  const {
    data: coursesData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['instructorCourses', selectedStatus],
    queryFn: () =>
      fetchInstructorCourses({
        status: selectedStatus === 'ALL' ? undefined : (selectedStatus as any),
        limit: 50,
      }),
  });

  const allCourses = coursesData?.items || [];
  const filteredCourses = allCourses.filter((course) =>
    course.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusTabs = [
    { label: 'All Courses', value: 'ALL' },
    { label: 'Draft', value: 'DRAFT' },
    { label: 'In Review', value: 'IN_REVIEW' },
    { label: 'Published', value: 'PUBLISHED' },
  ];

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs'>
        <div>
          <h1 className='text-2xl font-bold text-gray-900'>My Teaching Courses</h1>
          <p className='text-sm text-gray-600 mt-1'>
            Manage your course portfolio, draft curriculum, and prepare submissions for institutional review.
          </p>
        </div>
        <Link href='/admin/courses/new'>
          <Button className='bg-primary text-white hover:bg-primary/90 flex items-center gap-2'>
            <PlusCircle className='w-4 h-4' />
            <span>Create New Course</span>
          </Button>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className='bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4'>
        {/* Filter Tabs */}
        <div className='flex items-center space-x-1 overflow-x-auto'>
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSelectedStatus(tab.value)}
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
        <div className='relative min-w-[240px]'>
          <input
            type='text'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search your courses...'
            className='w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary'
          />
          <Search className='w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' />
        </div>
      </div>

      {/* Courses List */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
        {isLoading ? (
          <div className='p-6 space-y-4'>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className='h-20 bg-gray-100 rounded-xl animate-pulse' />
            ))}
          </div>
        ) : isError ? (
          <div className='p-8 text-center'>
            <p className='text-red-600 font-medium'>Failed to load instructor courses.</p>
            <Button variant='outline' size='sm' className='mt-3' onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className='text-center py-16 px-4'>
            <div className='w-16 h-16 rounded-2xl bg-gray-100 text-gray-400 mx-auto flex items-center justify-center mb-4'>
              <BookOpen className='w-8 h-8' />
            </div>
            <h3 className='text-lg font-bold text-gray-900'>No courses found</h3>
            <p className='text-sm text-gray-500 max-w-sm mx-auto mt-1 mb-6'>
              {searchQuery
                ? `No courses matching "${searchQuery}". Try adjusting your search or filter.`
                : 'You have not created any courses in this category yet.'}
            </p>
            <Link href='/admin/courses/new'>
              <Button className='bg-primary text-white hover:bg-primary/90'>
                <PlusCircle className='w-4 h-4 mr-2' />
                Create a Course
              </Button>
            </Link>
          </div>
        ) : (
          <div className='divide-y divide-gray-100'>
            {filteredCourses.map((course) => {
              const statusBadgeStyles = {
                DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
                IN_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200',
                PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                ARCHIVED: 'bg-slate-50 text-slate-700 border-slate-200',
              }[course.status] || 'bg-gray-50 text-gray-700 border-gray-200';

              return (
                <div
                  key={course.id}
                  className='p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-3'>
                      <h3 className='font-bold text-gray-900 text-lg truncate'>{course.title}</h3>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${statusBadgeStyles}`}
                      >
                        {course.status}
                      </span>
                    </div>
                    <div className='flex flex-wrap items-center gap-4 text-xs text-gray-500 mt-2'>
                      <span>Price: <strong>{course.price} {course.currency}</strong></span>
                      <span>Slug: <code className='text-gray-600 bg-gray-100 px-1 py-0.5 rounded'>{course.slug}</code></span>
                      <span>Updated: {course.updatedAt ? new Date(course.updatedAt).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </div>

                  {/* Context-Sensitive Action Buttons */}
                  <div className='flex flex-wrap items-center gap-2.5'>
                    {course.status === 'DRAFT' && (
                      <Button
                        size='sm'
                        onClick={() => setReviewModalCourseId(course.id)}
                        className='bg-primary text-white hover:bg-primary/90 flex items-center gap-1.5'
                      >
                        <Send className='w-4 h-4' />
                        <span>Submit for Review</span>
                      </Button>
                    )}

                    {course.status === 'IN_REVIEW' && (
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setWithdrawModalCourse(course)}
                        className='border-blue-300 text-blue-800 hover:bg-blue-50 flex items-center gap-1.5'
                      >
                        <RotateCcw className='w-4 h-4' />
                        <span>Withdraw Review</span>
                      </Button>
                    )}

                    {course.status === 'PUBLISHED' && (
                      <Link href={`/courses/${course.slug}`} target='_blank' rel='noopener noreferrer'>
                        <Button variant='outline' size='sm' className='flex items-center gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50'>
                          <ExternalLink className='w-4 h-4' />
                          <span>View Live</span>
                        </Button>
                      </Link>
                    )}

                    <Link href={`/instructor/courses/${course.id}/learners`}>
                      <Button variant='outline' size='sm' className='flex items-center gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50'>
                        <Users className='w-4 h-4' />
                        <span>Learners</span>
                      </Button>
                    </Link>

                    <Link href={`/admin/courses/${course.id}`}>
                      <Button variant='outline' size='sm' className='flex items-center gap-1.5'>
                        <FileEdit className='w-4 h-4' />
                        <span>{course.status === 'IN_REVIEW' ? 'View Curriculum' : 'Edit Curriculum'}</span>
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Submission Modal */}
      {reviewModalCourseId && (
        <CourseReviewModal
          courseId={reviewModalCourseId}
          courseTitle={allCourses.find((c) => c.id === reviewModalCourseId)?.title}
          open={!!reviewModalCourseId}
          onOpenChange={(open) => !open && setReviewModalCourseId(null)}
          onSuccess={() => refetch()}
        />
      )}

      {/* Review Withdrawal Modal */}
      {withdrawModalCourse && (
        <ReviewWithdrawalModal
          courseId={withdrawModalCourse.id}
          courseTitle={withdrawModalCourse.title}
          open={!!withdrawModalCourse}
          onOpenChange={(open) => !open && setWithdrawModalCourse(null)}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
