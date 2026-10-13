'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchInstructorCourses } from '@/lib/api/instructor';
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
} from 'lucide-react';

export function InstructorDashboardClient() {
  const { data: user } = useCurrentUser();

  const {
    data: coursesData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['instructorCourses', 'dashboard'],
    queryFn: () => fetchInstructorCourses({ limit: 100 }),
    staleTime: 60 * 1000,
  });

  const courses = coursesData?.items || [];

  const publishedCount = courses.filter((c) => c.status === 'PUBLISHED').length;
  const draftCount = courses.filter((c) => c.status === 'DRAFT').length;
  const inReviewCount = courses.filter((c) => c.status === 'IN_REVIEW').length;
  const totalCourses = courses.length;

  return (
    <div className='space-y-8'>
      {/* Header & Quick Action */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs'>
        <div>
          <h1 className='text-2xl font-bold text-gray-900'>
            Welcome back, {user?.name || 'Educator'}!
          </h1>
          <p className='text-sm text-gray-600 mt-1'>
            Manage your courses, track review submissions, and oversee your teaching curriculum.
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

      {/* Primary Metric Grid */}
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
            {isLoading ? (
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
            {isLoading ? (
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
            {isLoading ? (
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
            {isLoading ? (
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
              View all your authored courses, organize modules and lessons, and submit courses for institutional review.
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

      {/* Course Portfolio Status or Empty State */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs p-6'>
        <div className='flex items-center justify-between mb-6'>
          <h2 className='text-xl font-bold text-gray-900'>Recent Course Workspaces</h2>
          <Link
            href='/instructor/courses'
            className='text-sm font-medium text-primary hover:underline'
          >
            View all courses
          </Link>
        </div>

        {isLoading ? (
          <div className='space-y-4'>
            {[1, 2, 3].map((i) => (
              <div key={i} className='h-16 bg-gray-100 rounded-xl animate-pulse' />
            ))}
          </div>
        ) : isError ? (
          <div className='p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center justify-between'>
            <span>Failed to load courses. Please try again.</span>
            <Button variant='outline' size='sm' onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : courses.length === 0 ? (
          <div className='text-center py-12 px-4'>
            <div className='w-16 h-16 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4'>
              <BookOpen className='w-8 h-8' />
            </div>
            <h3 className='text-lg font-bold text-gray-900'>Ready to share your knowledge?</h3>
            <p className='text-sm text-gray-600 max-w-md mx-auto mt-2 mb-6'>
              Create your first course to get started with TechSprout. Draft your curriculum, add lessons and quizzes, and submit for institutional review.
            </p>
            <Link href='/admin/courses/new'>
              <Button className='bg-primary text-white hover:bg-primary/90'>
                <PlusCircle className='w-4 h-4 mr-2' />
                Create Your First Course
              </Button>
            </Link>
          </div>
        ) : (
          <div className='divide-y divide-gray-100'>
            {courses.slice(0, 5).map((course) => {
              const statusBadgeStyles = {
                DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
                IN_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200',
                PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                ARCHIVED: 'bg-slate-50 text-slate-700 border-slate-200',
              }[course.status] || 'bg-gray-50 text-gray-700 border-gray-200';

              return (
                <div
                  key={course.id}
                  className='py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-3'>
                      <h4 className='font-semibold text-gray-900 truncate'>{course.title}</h4>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${statusBadgeStyles}`}
                      >
                        {course.status}
                      </span>
                    </div>
                    <p className='text-xs text-gray-500 mt-1'>
                      Price: {course.price} {course.currency} &bull; Created:{' '}
                      {course.createdAt ? new Date(course.createdAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Link href={`/admin/courses/${course.id}`}>
                      <Button variant='outline' size='sm'>
                        Edit Curriculum
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
