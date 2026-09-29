'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CourseCard } from '../../cards/CourseCard';
import { TextBadge } from '../../ui/text-badge';
import Title from '../../Title';
import AnimatedText from '../../AnimatedText';
import { Button } from '../../ui/button';
import { fetchPublicCategories, fetchPublicCourses } from '@/lib/api/catalog';
import Link from 'next/link';

export default function FeaturedCourses() {
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('');

  const { data: categories = [] } = useQuery({
    queryKey: ['publicCategories'],
    queryFn: fetchPublicCategories,
    staleTime: 5 * 60 * 1000,
  });

  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['publicCourses', 'featured', selectedCategorySlug],
    queryFn: () =>
      fetchPublicCourses({
        limit: 6,
        categorySlug: selectedCategorySlug || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    staleTime: 60 * 1000,
  });

  const courses = coursesData?.items || [];

  return (
    <section className='common-container py-20 lg:py-[120px]'>
      <div>
        <div className='flex flex-col items-center justify-between gap-12 text-center md:flex-row md:text-left'>
          <div className='space-y-4'>
            <TextBadge>Explore Top Curriculums</TextBadge>
            <Title h={2}>
              Our <AnimatedText text='Courses' />
            </Title>
          </div>

          <div className='flex flex-wrap items-center justify-center gap-2'>
            <Button
              size='sm'
              variant={selectedCategorySlug === '' ? 'default' : 'ghost'}
              onClick={() => setSelectedCategorySlug('')}
              className='text-[15px] capitalize rounded-xl'
            >
              All Courses
            </Button>

            {categories.slice(0, 5).map((category, idx) => (
              <Button
                key={category.id}
                size='sm'
                variant={selectedCategorySlug === category.slug ? 'default' : 'ghost'}
                onClick={() => setSelectedCategorySlug(category.slug)}
                className='hover:text-foreground relative text-[15px] capitalize hover:bg-transparent rounded-xl'
              >
                {idx === 0 && (
                  <span className='bg-primary after:bg-primary absolute -top-6 left-1/2 rounded-md px-2 text-white after:absolute after:-bottom-1 after:left-2 after:-z-10 after:h-4 after:w-4 after:rotate-45 after:skew-6 text-xs'>
                    Hot
                  </span>
                )}
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className='mt-16 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3'>
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className='h-[400px] rounded-2xl bg-white border border-gray-100 shadow-sm animate-pulse p-4 space-y-4'
              >
                <div className='h-[200px] bg-gray-100 rounded-xl w-full' />
                <div className='h-4 bg-gray-100 rounded w-1/3' />
                <div className='h-6 bg-gray-100 rounded w-4/5' />
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className='mt-16 text-center py-12 bg-white rounded-3xl border border-gray-100 p-8 max-w-md mx-auto'>
            <p className='text-sm text-gray-500 mb-4'>No published courses found for this category.</p>
            <Link href='/courses'>
              <Button size='sm' variant='outline' className='rounded-xl'>
                View All Courses
              </Button>
            </Link>
          </div>
        ) : (
          <div className='mt-16 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3'>
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
