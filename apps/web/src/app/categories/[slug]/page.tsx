'use client';

import React, { Suspense } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPublicCategoryCourses,
  fetchPublicCategories,
  type PublicCourseQueryParams,
} from '@/lib/api/catalog';
import { CourseCard } from '@/components/cards/CourseCard';
import Hero from '@/components/Hero';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  AlertCircle,
  FolderTree,
  BookOpen,
} from 'lucide-react';

function CategoryLoadingSkeleton() {
  return (
    <>
      <Hero pageName='Category' />
      <section className='container mx-auto px-4 py-12 lg:py-20'>
        <div className='h-8 w-48 bg-gray-200 rounded-lg animate-pulse mb-8' />
        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8'>
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className='h-[420px] rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse p-4 space-y-4'
            >
              <div className='h-[200px] bg-gray-200 rounded-xl w-full' />
              <div className='h-4 bg-gray-200 rounded w-1/3' />
              <div className='h-6 bg-gray-200 rounded w-4/5' />
              <div className='h-10 bg-gray-200 rounded-xl w-full mt-auto' />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function CategoryPageContent() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const slug = params?.slug as string;
  const pageParam = parseInt(searchParams.get('page') || '1', 10);

  // Fetch active categories to get name and description
  const { data: allCategories = [] } = useQuery({
    queryKey: ['publicCategories'],
    queryFn: fetchPublicCategories,
    staleTime: 5 * 60 * 1000,
  });

  const category = allCategories.find((c) => c.slug === slug);

  // Fetch published courses for this category
  const queryParams: PublicCourseQueryParams = {
    page: pageParam,
    limit: 6,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  };

  const {
    data: paginatedData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['publicCategoryCourses', slug, queryParams],
    queryFn: () => fetchPublicCategoryCourses(slug, queryParams),
    enabled: !!slug,
    retry: 1,
  });

  const handlePageChange = (newPage: number) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set('page', String(newPage));
    router.push(`${pathname}?${current.toString()}`);
  };

  if (isLoading) {
    return <CategoryLoadingSkeleton />;
  }

  if (isError) {
    const statusCode = (error as any)?.response?.status;
    const isNotFound = statusCode === 404;

    return (
      <>
        <Hero pageName='Category' />
        <section className='container mx-auto px-4 py-16 max-w-lg text-center'>
          <div className='bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4'>
            <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
              <AlertCircle className='w-8 h-8' />
            </div>
            <h2 className='text-2xl font-bold text-gray-900'>
              {isNotFound ? 'Category Not Found' : 'Error Loading Category'}
            </h2>
            <p className='text-xs text-gray-500 leading-relaxed'>
              {isNotFound
                ? 'This category does not exist or has been deactivated by administrators.'
                : (error as any)?.response?.data?.message || 'Unable to retrieve category courses.'}
            </p>
            <div className='pt-2 flex justify-center gap-3'>
              <Link href='/courses'>
                <Button variant='outline' size='sm' className='rounded-xl text-xs'>
                  <ArrowLeft className='w-3.5 h-3.5 mr-1.5' />
                  Back to All Courses
                </Button>
              </Link>
              {!isNotFound && (
                <Button onClick={() => refetch()} size='sm' className='rounded-xl text-xs'>
                  Retry
                </Button>
              )}
            </div>
          </div>
        </section>
      </>
    );
  }

  const courses = paginatedData?.items || [];
  const pagination = paginatedData?.pagination;
  const categoryName = category?.name || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const categoryDescription = category?.description || 'Browse published institutional courses under this topic.';

  return (
    <>
      <Hero pageName={categoryName} />

      <section className='container mx-auto px-4 py-12 lg:py-16'>
        {/* Category Header */}
        <div className='max-w-3xl mb-12 space-y-3'>
          <div className='flex items-center gap-2'>
            <Link
              href='/courses'
              className='text-xs font-semibold text-primary hover:underline flex items-center gap-1'
            >
              <ArrowLeft className='w-3.5 h-3.5' />
              <span>All Courses</span>
            </Link>
            <span className='text-gray-300'>/</span>
            <span className='text-xs text-gray-500 font-medium'>{categoryName}</span>
          </div>

          <Title h={2} className='text-2xl sm:text-3xl font-bold text-gray-900'>
            {categoryName}
          </Title>
          <p className='text-sm text-gray-600 leading-relaxed'>{categoryDescription}</p>
        </div>

        {/* Courses List */}
        {courses.length === 0 ? (
          <div className='bg-white p-16 rounded-3xl border border-gray-100 shadow-xs max-w-md mx-auto text-center space-y-4'>
            <div className='w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto'>
              <BookOpen className='w-7 h-7' />
            </div>
            <h3 className='text-lg font-bold text-gray-900'>No Courses Available</h3>
            <p className='text-xs text-gray-500'>
              There are currently no published public courses under {categoryName}. Check back soon as new cohorts open.
            </p>
            <Link href='/courses'>
              <Button size='sm' variant='outline' className='rounded-xl text-xs'>
                Browse All Courses
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8'>
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className='mt-12 flex items-center justify-between border-t border-gray-100 pt-6'>
                <Button
                  size='icon'
                  variant='outline'
                  disabled={!pagination.hasPreviousPage || isFetching}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  className='rounded-full h-10 w-10 disabled:opacity-40'
                >
                  <ChevronLeft className='w-4 h-4' />
                </Button>

                <div className='flex items-center gap-1.5'>
                  {Array.from({ length: pagination.totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    const isCurrent = pageNum === pagination.page;
                    return (
                      <Button
                        key={pageNum}
                        size='sm'
                        variant={isCurrent ? 'default' : 'outline'}
                        onClick={() => handlePageChange(pageNum)}
                        className={`rounded-xl text-xs h-9 min-w-9 ${
                          isCurrent ? 'bg-primary text-white shadow-xs' : 'border-gray-200'
                        }`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  size='icon'
                  variant='outline'
                  disabled={!pagination.hasNextPage || isFetching}
                  onClick={() => handlePageChange(pagination.page + 1)}
                  className='rounded-full h-10 w-10 disabled:opacity-40'
                >
                  <ChevronRight className='w-4 h-4' />
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

export default function CategoryPage() {
  return (
    <Suspense fallback={<CategoryLoadingSkeleton />}>
      <CategoryPageContent />
    </Suspense>
  );
}
