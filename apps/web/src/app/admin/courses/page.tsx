'use client';

import { formatMoney } from '@/lib/money';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminCourses,
  fetchAdminCategories,
  fetchAdminUsers,
  deleteCourse,
  type AdminCourseQueryParams,
} from '@/lib/api/catalog';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { CourseStatusBadge, VisibilityBadge } from '@/components/admin/StatusBadge';
import {
  Search,
  Plus,
  ArrowUpDown,
  Edit,
  Trash2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import type { CourseDto } from '@techsprout/contracts';

export default function AdminCoursesPage() {
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  // Filters and pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [level, setLevel] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'price' | 'title'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Deletion state
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Query categories for filter dropdown
  const { data: categories = [] } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: fetchAdminCategories,
    staleTime: 5 * 60 * 1000,
  });

  // Query instructors for admin filter dropdown
  const { data: usersList = [] } = useQuery({
    queryKey: ['admin', 'users', 'instructors'],
    queryFn: () => fetchAdminUsers(100),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const instructors = usersList.filter(
    (u) => u.role === 'instructor' || u.role === 'admin'
  );

  // Main Courses Query
  const queryParams: AdminCourseQueryParams = {
    page,
    limit,
    search: search.trim() || undefined,
    categoryId: categoryId || undefined,
    status: status || undefined,
    level: level || undefined,
    instructorId: isAdmin && instructorId ? instructorId : undefined,
    sortBy,
    sortOrder,
  };

  const {
    data: paginatedData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin', 'courses', queryParams],
    queryFn: () => fetchAdminCourses(queryParams),
    placeholderData: (prev) => prev,
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCourse(id),
    onSuccess: () => {
      setDeletingCourseId(null);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
    },
    onError: (err: any) => {
      setDeleteError(
        err?.response?.data?.message || err?.message || 'Failed to delete course'
      );
    },
  });

  const handleDelete = (course: CourseDto) => {
    if (course.status !== 'DRAFT') {
      alert('Only draft courses can be deleted. Published or archived courses cannot be hard-deleted.');
      return;
    }
    if (confirm(`Are you sure you want to permanently delete draft course "${course.title}"?`)) {
      setDeleteError(null);
      deleteMutation.mutate(course.id);
    }
  };

  const handleSortToggle = (field: 'createdAt' | 'price' | 'title') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const courses = paginatedData?.items || [];
  const pagination = paginatedData?.pagination;

  return (
    <div className='space-y-6'>
      {/* Top Banner / Actions */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight'>
            Course Catalog
          </h1>
          <p className='text-sm text-gray-500 mt-1'>
            {isAdmin
              ? 'Manage institutional courses, curriculum, metadata, and publishing state'
              : 'Manage and update your assigned courses, modules, and lessons'}
          </p>
        </div>

        <Link
          href='/admin/courses/new'
          className='inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs'
        >
          <Plus className='w-4 h-4' />
          <span>Create Course</span>
        </Link>
      </div>

      {deleteError && (
        <div className='p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between'>
          <div className='flex items-center space-x-2 text-sm'>
            <AlertCircle className='w-4 h-4 shrink-0' />
            <span>{deleteError}</span>
          </div>
          <button
            onClick={() => setDeleteError(null)}
            className='text-xs font-semibold hover:underline'
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className='bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-xs space-y-4'>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3'>
          {/* Search */}
          <div className='relative lg:col-span-2'>
            <Search className='w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400' />
            <input
              type='text'
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder='Search by title or description...'
              className='w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              aria-label='Filter by Category'
              className='w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
            >
              <option value=''>All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              aria-label='Filter by Status'
              className='w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
            >
              <option value=''>All Statuses</option>
              <option value='DRAFT'>Draft</option>
              <option value='PUBLISHED'>Published</option>
              <option value='ARCHIVED'>Archived</option>
            </select>
          </div>

          {/* Level Filter */}
          <div>
            <select
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setPage(1);
              }}
              aria-label='Filter by Level'
              className='w-full px-3 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
            >
              <option value=''>All Levels</option>
              <option value='BEGINNER'>Beginner</option>
              <option value='INTERMEDIATE'>Intermediate</option>
              <option value='ADVANCED'>Advanced</option>
              <option value='ALL_LEVELS'>All Levels</option>
            </select>
          </div>
        </div>

        {/* Secondary filters row (Instructor filter for admin, sorting, reset) */}
        <div className='flex flex-wrap items-center justify-between pt-2 border-t border-gray-100 gap-3'>
          <div className='flex flex-wrap items-center gap-3'>
            {isAdmin && (
              <div className='flex items-center space-x-2 text-xs text-gray-600'>
                <span className='font-medium'>Instructor:</span>
                <select
                  value={instructorId}
                  onChange={(e) => {
                    setInstructorId(e.target.value);
                    setPage(1);
                  }}
                  aria-label='Filter by Instructor'
                  className='px-2.5 py-1 text-xs rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value=''>All Instructors</option>
                  {instructors.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.name} ({ins.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className='flex items-center space-x-2 text-xs text-gray-600'>
              <span className='font-medium'>Sort:</span>
              <button
                onClick={() => handleSortToggle('createdAt')}
                className={`px-2 py-1 rounded border text-xs font-medium flex items-center space-x-1 ${
                  sortBy === 'createdAt'
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>Date</span>
                <ArrowUpDown className='w-3 h-3' />
              </button>
              <button
                onClick={() => handleSortToggle('title')}
                className={`px-2 py-1 rounded border text-xs font-medium flex items-center space-x-1 ${
                  sortBy === 'title'
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>Title</span>
                <ArrowUpDown className='w-3 h-3' />
              </button>
              <button
                onClick={() => handleSortToggle('price')}
                className={`px-2 py-1 rounded border text-xs font-medium flex items-center space-x-1 ${
                  sortBy === 'price'
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>Price</span>
                <ArrowUpDown className='w-3 h-3' />
              </button>
            </div>
          </div>

          <div className='flex items-center space-x-2'>
            {(search || categoryId || status || level || instructorId) && (
              <button
                onClick={() => {
                  setSearch('');
                  setCategoryId('');
                  setStatus('');
                  setLevel('');
                  setInstructorId('');
                  setPage(1);
                }}
                className='text-xs text-gray-500 hover:text-gray-900 underline'
              >
                Reset Filters
              </button>
            )}

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              title='Refresh'
              className='p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50'
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Course Table / List */}
      <div className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden'>
        {isLoading ? (
          <div className='p-12 text-center'>
            <div className='w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4' />
            <p className='text-sm text-gray-500'>Loading courses from API...</p>
          </div>
        ) : isError ? (
          <div className='p-12 text-center max-w-md mx-auto'>
            <AlertCircle className='w-10 h-10 text-red-500 mx-auto mb-3' />
            <h3 className='text-base font-semibold text-gray-900 mb-1'>Failed to load courses</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {(error as any)?.response?.data?.message || (error as any)?.message || 'Network error'}
            </p>
            <button
              onClick={() => refetch()}
              className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
            >
              Retry
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className='p-12 text-center max-w-md mx-auto'>
            <div className='w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400'>
              <BookOpen className='w-6 h-6' />
            </div>
            <h3 className='text-base font-semibold text-gray-900 mb-1'>No courses found</h3>
            <p className='text-xs text-gray-500 mb-4'>
              {search || categoryId || status || level || instructorId
                ? 'No courses matched your active filter criteria. Try adjusting your search.'
                : 'Get started by creating your first course in the institutional catalog.'}
            </p>
            <Link
              href='/admin/courses/new'
              className='inline-flex items-center space-x-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
            >
              <Plus className='w-3.5 h-3.5' />
              <span>Create Course</span>
            </Link>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-sm text-gray-600'>
              <thead className='bg-gray-50/80 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200'>
                <tr>
                  <th scope='col' className='px-4 py-3.5'>Course</th>
                  <th scope='col' className='px-4 py-3.5'>Category</th>
                  <th scope='col' className='px-4 py-3.5'>Instructor</th>
                  <th scope='col' className='px-4 py-3.5'>Status</th>
                  <th scope='col' className='px-4 py-3.5'>Visibility</th>
                  <th scope='col' className='px-4 py-3.5'>Level</th>
                  <th scope='col' className='px-4 py-3.5'>Price</th>
                  <th scope='col' className='px-4 py-3.5'>Updated</th>
                  <th scope='col' className='px-4 py-3.5 text-right'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {courses.map((course) => {
                  const formattedPrice =
                    Number(course.price) === 0
                      ? 'Free'
                      : formatMoney(course.price, course.currency || 'BDT');

                  const formattedDate = new Date(course.updatedAt || course.createdAt).toLocaleDateString(
                    'en-US',
                    { month: 'short', day: 'numeric', year: 'numeric' }
                  );

                  return (
                    <tr
                      key={course.id}
                      className='hover:bg-gray-50/60 transition-colors group'
                    >
                      {/* Title & Slug & Thumbnail */}
                      <td className='px-4 py-3.5'>
                        <div className='flex items-center space-x-3'>
                          <div className='w-12 h-9 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200'>
                            {course.thumbnailUrl ? (
                              <img
                                src={course.thumbnailUrl}
                                alt={course.title}
                                className='w-full h-full object-cover'
                              />
                            ) : (
                              <div className='w-full h-full flex items-center justify-center text-gray-300'>
                                <BookOpen className='w-4 h-4' />
                              </div>
                            )}
                          </div>
                          <div className='min-w-0'>
                            <Link
                              href={`/admin/courses/${course.id}`}
                              className='font-semibold text-gray-900 hover:text-primary transition-colors line-clamp-1'
                            >
                              {course.title}
                            </Link>
                            <span className='text-xs text-gray-400 block font-mono truncate max-w-xs'>
                              /{course.slug}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className='px-4 py-3.5 whitespace-nowrap'>
                        <span className='px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700'>
                          {course.category?.name || 'Uncategorized'}
                        </span>
                      </td>

                      {/* Instructor */}
                      <td className='px-4 py-3.5 whitespace-nowrap'>
                        <span className='text-xs font-medium text-gray-800 block'>
                          {course.instructor?.name || 'Assigned Instructor'}
                        </span>
                        <span className='text-[11px] text-gray-400 block truncate max-w-[140px]'>
                          {course.instructor?.email}
                        </span>
                      </td>

                      {/* Status */}
                      <td className='px-4 py-3.5 whitespace-nowrap'>
                        <CourseStatusBadge status={course.status} />
                      </td>

                      {/* Visibility */}
                      <td className='px-4 py-3.5 whitespace-nowrap'>
                        <VisibilityBadge visibility={course.visibility} />
                      </td>

                      {/* Level */}
                      <td className='px-4 py-3.5 whitespace-nowrap text-xs text-gray-600 capitalize'>
                        {course.level?.toLowerCase().replace('_', ' ') || 'Beginner'}
                      </td>

                      {/* Price */}
                      <td className='px-4 py-3.5 whitespace-nowrap font-semibold text-xs text-gray-800'>
                        {formattedPrice}
                      </td>

                      {/* Updated Date */}
                      <td className='px-4 py-3.5 whitespace-nowrap text-xs text-gray-500'>
                        {formattedDate}
                      </td>

                      {/* Action buttons */}
                      <td className='px-4 py-3.5 text-right whitespace-nowrap'>
                        <div className='flex items-center justify-end space-x-1.5'>
                          <Link
                            href={`/admin/courses/${course.id}`}
                            className='p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors'
                            title='Edit Course & Curriculum'
                          >
                            <Edit className='w-4 h-4' />
                          </Link>

                          {course.status === 'DRAFT' && (
                            <button
                              onClick={() => handleDelete(course)}
                              disabled={deleteMutation.isPending}
                              className='p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors'
                              title='Delete Draft'
                            >
                              <Trash2 className='w-4 h-4' />
                            </button>
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

        {/* Pagination Bar */}
        {pagination && pagination.totalPages > 1 && (
          <div className='px-4 py-3.5 border-t border-gray-200 flex items-center justify-between text-xs text-gray-600'>
            <span>
              Showing page <strong className='font-semibold'>{pagination.page}</strong> of{' '}
              <strong className='font-semibold'>{pagination.totalPages}</strong> (
              {pagination.total} total courses)
            </span>

            <div className='flex items-center space-x-2'>
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={!pagination.hasPreviousPage || isFetching}
                className='px-2.5 py-1.5 rounded-lg border border-gray-300 font-medium flex items-center space-x-1 disabled:opacity-40 hover:bg-gray-50'
              >
                <ChevronLeft className='w-3.5 h-3.5' />
                <span>Prev</span>
              </button>

              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.hasNextPage || isFetching}
                className='px-2.5 py-1.5 rounded-lg border border-gray-300 font-medium flex items-center space-x-1 disabled:opacity-40 hover:bg-gray-50'
              >
                <span>Next</span>
                <ChevronRight className='w-3.5 h-3.5' />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
