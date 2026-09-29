'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CourseCard } from '@/components/cards/CourseCard';
import Hero from '@/components/Hero';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  fetchPublicCourses,
  fetchPublicCategories,
  type PublicCourseQueryParams,
} from '@/lib/api/catalog';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  AlertCircle,
  BookOpen,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import type { CourseLevel } from '@techsprout/contracts';

interface SortOption {
  label: string;
  sortBy: 'createdAt' | 'price' | 'title';
  sortOrder: 'asc' | 'desc';
}

const SORT_OPTIONS: SortOption[] = [
  { label: 'Release Date (newest first)', sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'Release Date (oldest first)', sortBy: 'createdAt', sortOrder: 'asc' },
  { label: 'Course Title (a-z)', sortBy: 'title', sortOrder: 'asc' },
  { label: 'Course Title (z-a)', sortBy: 'title', sortOrder: 'desc' },
  { label: 'Price (low to high)', sortBy: 'price', sortOrder: 'asc' },
  { label: 'Price (high to low)', sortBy: 'price', sortOrder: 'desc' },
];

function CoursesLoadingSkeleton() {
  return (
    <>
      <Hero pageName='Courses' />
      <section className='container mx-auto px-4 py-12 lg:py-20'>
        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8'>
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className='h-[420px] rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse p-4 space-y-4'
            >
              <div className='h-[200px] bg-gray-200 rounded-xl w-full' />
              <div className='h-4 bg-gray-200 rounded w-1/3' />
              <div className='h-6 bg-gray-200 rounded w-4/5' />
              <div className='h-4 bg-gray-200 rounded w-1/2' />
              <div className='h-10 bg-gray-200 rounded-xl w-full mt-auto' />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function CoursesContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read URL query parameters
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const searchParam = searchParams.get('search') || '';
  const categorySlugParam = searchParams.get('categorySlug') || '';
  const levelParam = searchParams.get('level') || '';
  const priceFilterParam = searchParams.get('priceType') || 'all'; // 'all' | 'free' | 'paid'
  const sortByParam = (searchParams.get('sortBy') as 'createdAt' | 'price' | 'title') || 'createdAt';
  const sortOrderParam = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';

  // Search input state with debounce
  const [searchInput, setSearchInput] = useState(searchParam);

  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  // Query categories
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ['publicCategories'],
    queryFn: fetchPublicCategories,
    staleTime: 5 * 60 * 1000,
  });

  // Calculate price thresholds for backend query
  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  if (priceFilterParam === 'free') {
    maxPrice = 0;
  } else if (priceFilterParam === 'paid') {
    minPrice = 0.01;
  }

  // Construct query params for API
  const queryParams: PublicCourseQueryParams = {
    page: pageParam,
    limit: 6,
    search: searchParam.trim() || undefined,
    categorySlug: categorySlugParam || undefined,
    level: levelParam ? (levelParam as CourseLevel) : undefined,
    minPrice,
    maxPrice,
    sortBy: sortByParam,
    sortOrder: sortOrderParam,
  };

  // Main Courses Query
  const {
    data: paginatedData,
    isLoading: isLoadingCourses,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['publicCourses', queryParams],
    queryFn: () => fetchPublicCourses(queryParams),
    placeholderData: (prev) => prev,
    staleTime: 30 * 1000,
  });

  // URL sync helper
  const updateUrlParams = (newParams: Record<string, string | number | undefined | null>) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));

    Object.entries(newParams).forEach(([key, val]) => {
      if (val === undefined || val === null || val === '') {
        current.delete(key);
      } else {
        current.set(key, String(val));
      }
    });

    router.push(`${pathname}?${current.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrlParams({ search: searchInput.trim(), page: 1 });
  };

  const handleCategorySelect = (slug: string) => {
    const nextSlug = categorySlugParam === slug ? '' : slug;
    updateUrlParams({ categorySlug: nextSlug, page: 1 });
  };

  const handleLevelSelect = (level: string) => {
    const nextLevel = levelParam === level ? '' : level;
    updateUrlParams({ level: nextLevel, page: 1 });
  };

  const handlePriceSelect = (type: 'all' | 'free' | 'paid') => {
    const nextType = priceFilterParam === type ? 'all' : type;
    updateUrlParams({ priceType: nextType === 'all' ? undefined : nextType, page: 1 });
  };

  const handleSortSelect = (opt: SortOption) => {
    updateUrlParams({ sortBy: opt.sortBy, sortOrder: opt.sortOrder, page: 1 });
  };

  const handleResetFilters = () => {
    setSearchInput('');
    router.push(pathname);
  };

  const currentSortOption =
    SORT_OPTIONS.find(
      (opt) => opt.sortBy === sortByParam && opt.sortOrder === sortOrderParam
    ) || SORT_OPTIONS[0];

  const courses = paginatedData?.items || [];
  const pagination = paginatedData?.pagination;

  return (
    <>
      <Hero pageName='Courses' />

      <section className='container mx-auto px-4 py-12 lg:py-20'>
        {/* Top Control Bar: Search and Sort */}
        <div className='flex flex-col justify-between gap-4 md:flex-row md:items-center bg-white p-4 rounded-2xl border border-gray-100 shadow-xs mb-8'>
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className='relative flex-1 max-w-md'>
            <input
              type='text'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder='Search courses by topic, skill, or title...'
              className='focus:border-primary focus:ring-primary h-11 w-full rounded-xl border border-gray-200 pl-10 pr-20 text-sm focus:ring-2 focus:outline-none'
            />
            <Search className='absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-gray-400' />
            <Button
              type='submit'
              size='sm'
              className='absolute top-1/2 right-1.5 -translate-y-1/2 rounded-lg text-xs h-8 px-3'
            >
              Search
            </Button>
          </form>

          {/* Sort Dropdown */}
          <div className='flex items-center space-x-3'>
            <span className='text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:inline'>
              Sort By:
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='outline'
                  className='flex h-11 items-center space-x-2 text-sm whitespace-nowrap rounded-xl border-gray-200'
                >
                  <span>{currentSortOption.label}</span>
                  <ChevronDown className='h-4 w-4 text-gray-400' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-[240px] rounded-xl shadow-lg'>
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.label}
                    onClick={() => handleSortSelect(opt)}
                    className={`cursor-pointer text-xs py-2 ${
                      opt.label === currentSortOption.label ? 'font-bold text-primary bg-primary/5' : ''
                    }`}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Catalog Main Layout */}
        <div className='mt-6 gap-8 lg:flex'>
          {/* Left Sidebar Filters */}
          <aside className='mb-8 lg:mb-0 lg:w-[260px] shrink-0 space-y-6'>
            {/* Category Filter */}
            <div className='rounded-2xl p-5 bg-white border border-gray-100 shadow-xs'>
              <Title h={3} className='text-base font-bold text-gray-900 mb-1'>
                Categories
              </Title>
              <span className='bg-primary block h-1 w-6 rounded-full mb-4' />

              <div className='space-y-2.5 max-h-[280px] overflow-y-auto pr-1'>
                {isLoadingCategories ? (
                  <p className='text-xs text-gray-400'>Loading categories...</p>
                ) : categories.length === 0 ? (
                  <p className='text-xs text-gray-400'>No categories found</p>
                ) : (
                  categories.map((category) => {
                    const isChecked = categorySlugParam === category.slug;
                    return (
                      <div
                        key={category.id}
                        onClick={() => handleCategorySelect(category.slug)}
                        className='flex items-center justify-between group cursor-pointer text-sm py-1'
                      >
                        <div className='flex items-center space-x-2.5'>
                          <Checkbox
                            id={category.slug}
                            checked={isChecked}
                            onCheckedChange={() => handleCategorySelect(category.slug)}
                            className='rounded-md border-gray-300 data-[state=checked]:bg-primary'
                          />
                          <Label
                            htmlFor={category.slug}
                            className={`cursor-pointer text-xs ${
                              isChecked ? 'font-bold text-primary' : 'text-gray-600 group-hover:text-gray-900'
                            }`}
                          >
                            {category.name}
                          </Label>
                        </div>
                        {category.courseCount !== undefined && (
                          <span className='text-[11px] text-gray-400 font-mono'>
                            {category.courseCount}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Level Filter */}
            <div className='rounded-2xl p-5 bg-white border border-gray-100 shadow-xs'>
              <Title h={3} className='text-base font-bold text-gray-900 mb-1'>
                Difficulty Level
              </Title>
              <span className='bg-primary block h-1 w-6 rounded-full mb-4' />

              <div className='space-y-2.5'>
                {[
                  { label: 'Beginner', val: 'BEGINNER' },
                  { label: 'Intermediate', val: 'INTERMEDIATE' },
                  { label: 'Advanced', val: 'ADVANCED' },
                  { label: 'All Levels', val: 'ALL_LEVELS' },
                ].map((lvl) => {
                  const isChecked = levelParam === lvl.val;
                  return (
                    <div
                      key={lvl.val}
                      onClick={() => handleLevelSelect(lvl.val)}
                      className='flex items-center space-x-2.5 group cursor-pointer text-sm py-0.5'
                    >
                      <Checkbox
                        id={`lvl-${lvl.val}`}
                        checked={isChecked}
                        onCheckedChange={() => handleLevelSelect(lvl.val)}
                        className='rounded-md border-gray-300 data-[state=checked]:bg-primary'
                      />
                      <Label
                        htmlFor={`lvl-${lvl.val}`}
                        className={`cursor-pointer text-xs ${
                          isChecked ? 'font-bold text-primary' : 'text-gray-600 group-hover:text-gray-900'
                        }`}
                      >
                        {lvl.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Price Filter */}
            <div className='rounded-2xl p-5 bg-white border border-gray-100 shadow-xs'>
              <Title h={3} className='text-base font-bold text-gray-900 mb-1'>
                Price
              </Title>
              <span className='bg-primary block h-1 w-6 rounded-full mb-4' />

              <div className='space-y-2.5'>
                <div
                  onClick={() => handlePriceSelect('all')}
                  className='flex items-center space-x-2.5 group cursor-pointer text-sm py-0.5'
                >
                  <Checkbox
                    id='price-all'
                    checked={priceFilterParam === 'all'}
                    onCheckedChange={() => handlePriceSelect('all')}
                    className='rounded-md border-gray-300 data-[state=checked]:bg-primary'
                  />
                  <Label
                    htmlFor='price-all'
                    className={`cursor-pointer text-xs ${
                      priceFilterParam === 'all' ? 'font-bold text-primary' : 'text-gray-600'
                    }`}
                  >
                    All Courses
                  </Label>
                </div>

                <div
                  onClick={() => handlePriceSelect('free')}
                  className='flex items-center space-x-2.5 group cursor-pointer text-sm py-0.5'
                >
                  <Checkbox
                    id='price-free'
                    checked={priceFilterParam === 'free'}
                    onCheckedChange={() => handlePriceSelect('free')}
                    className='rounded-md border-gray-300 data-[state=checked]:bg-primary'
                  />
                  <Label
                    htmlFor='price-free'
                    className={`cursor-pointer text-xs ${
                      priceFilterParam === 'free' ? 'font-bold text-primary' : 'text-gray-600'
                    }`}
                  >
                    Free
                  </Label>
                </div>

                <div
                  onClick={() => handlePriceSelect('paid')}
                  className='flex items-center space-x-2.5 group cursor-pointer text-sm py-0.5'
                >
                  <Checkbox
                    id='price-paid'
                    checked={priceFilterParam === 'paid'}
                    onCheckedChange={() => handlePriceSelect('paid')}
                    className='rounded-md border-gray-300 data-[state=checked]:bg-primary'
                  />
                  <Label
                    htmlFor='price-paid'
                    className={`cursor-pointer text-xs ${
                      priceFilterParam === 'paid' ? 'font-bold text-primary' : 'text-gray-600'
                    }`}
                  >
                    Paid
                  </Label>
                </div>
              </div>
            </div>

            {/* Reset Filters */}
            {(searchParam || categorySlugParam || levelParam || priceFilterParam !== 'all') && (
              <Button
                variant='outline'
                size='sm'
                onClick={handleResetFilters}
                className='w-full rounded-xl text-xs flex items-center justify-center space-x-1.5'
              >
                <RotateCcw className='w-3.5 h-3.5' />
                <span>Reset All Filters</span>
              </Button>
            )}
          </aside>

          {/* Right Main Courses Display */}
          <main className='flex-1'>
            {isLoadingCourses && !paginatedData ? (
              <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className='h-[420px] rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse p-4 space-y-4'
                  >
                    <div className='h-[200px] bg-gray-100 rounded-xl w-full' />
                    <div className='h-4 bg-gray-100 rounded w-1/3' />
                    <div className='h-6 bg-gray-100 rounded w-4/5' />
                    <div className='h-4 bg-gray-100 rounded w-1/2' />
                    <div className='h-10 bg-gray-100 rounded-xl w-full mt-auto' />
                  </div>
                ))}
              </div>
            ) : isError ? (
              <div className='p-12 text-center bg-white rounded-2xl border border-gray-100 shadow-xs max-w-lg mx-auto'>
                <AlertCircle className='w-12 h-12 text-red-500 mx-auto mb-3' />
                <h3 className='text-lg font-bold text-gray-900 mb-1'>Unable to load courses</h3>
                <p className='text-xs text-gray-500 mb-6'>
                  {(error as any)?.response?.data?.message || 'An error occurred while contacting the catalog API.'}
                </p>
                <Button onClick={() => refetch()} size='sm' className='rounded-xl'>
                  Try Again
                </Button>
              </div>
            ) : courses.length === 0 ? (
              <div className='p-16 text-center bg-white rounded-2xl border border-gray-100 shadow-xs max-w-md mx-auto'>
                <div className='w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4'>
                  <BookOpen className='w-7 h-7' />
                </div>
                <h3 className='text-lg font-bold text-gray-900 mb-1'>No courses found</h3>
                <p className='text-xs text-gray-500 mb-6'>
                  {searchParam || categorySlugParam || levelParam || priceFilterParam !== 'all'
                    ? 'No public courses match your current search and filter selections.'
                    : 'There are currently no published courses available in the catalog.'}
                </p>
                <Button onClick={handleResetFilters} variant='outline' size='sm' className='rounded-xl'>
                  Clear Filters
                </Button>
              </div>
            ) : (
              <>
                <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'>
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
                      onClick={() => updateUrlParams({ page: pagination.page - 1 })}
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
                            onClick={() => updateUrlParams({ page: pageNum })}
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
                      onClick={() => updateUrlParams({ page: pagination.page + 1 })}
                      className='rounded-full h-10 w-10 disabled:opacity-40'
                    >
                      <ChevronRight className='w-4 h-4' />
                    </Button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </section>
    </>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<CoursesLoadingSkeleton />}>
      <CoursesContent />
    </Suspense>
  );
}
