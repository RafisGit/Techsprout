'use client';
import { CourseCard } from '@/components/cards/CourseCard';
import Hero from '@/components/Hero';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { getCategories } from '@/lib/mockData/mockApi';
import { courses } from '@/lib/mockData/mockData';
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';

export default function Courses() {
  const [selectedFilter, setSelectedFilter] = useState('Release Date (newest first)');

  const filters = [
    'Release Date (newest first)',
    'Release Date (oldest first)',
    'Course Title (a-z)',
    'Course Title (z-a)',
  ];

  const categories = getCategories();

  return (
    <>
      <Hero pageName='Courses' />
      <section className='container mx-auto px-4 py-12 lg:py-20'>
        {/* Search and sort */}
        <div className='flex flex-col justify-between gap-4 md:flex-row md:items-center'>
          <div className='relative'>
            <input
              type='text'
              placeholder='Search courses...'
              className='focus:border-primary focus:ring-primary h-10 w-full rounded-md border border-gray-300 pl-8 text-sm focus:ring-2 focus:outline-none'
            />
            <Button
              size={'icon'}
              variant={'ghost'}
              className='hover:text-primary absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400 hover:bg-transparent'
            >
              <Search />
            </Button>
          </div>
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant='outline'
                  className='flex h-10 items-center space-x-2 text-sm whitespace-nowrap capitalize'
                >
                  <span>{selectedFilter}</span>
                  <ChevronDown className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' className='w-[220px]'>
                {filters.map((filter) => (
                  <DropdownMenuItem
                    key={filter}
                    onClick={() => setSelectedFilter(filter)}
                    className='cursor-pointer'
                  >
                    {filter}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className='mt-6 gap-4 lg:flex'>
          {/* Category and price filter */}
          <div className='mb-6 grid grid-cols-1 gap-2 md:grid-cols-2 lg:mb-0 lg:block lg:w-[18%]'>
            <div className='h-fit rounded-xl p-4 shadow-2xl'>
              <Title h={3}>Categories</Title>
              <span className='bg-primary block h-1 w-5 rounded-2xl'></span>
              <div className='mt-4 space-y-4'>
                {categories.map((category, idx) => (
                  <div className='flex items-center gap-3' key={idx}>
                    <Checkbox id={category} className='cursor-pointer shadow' />
                    <Label htmlFor={category} className='cursor-pointer'>
                      {category}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className='rounded-xl p-4 shadow-2xl lg:mt-6 lg:h-fit'>
              <Title h={3}>Price</Title>
              <span className='bg-primary block h-1 w-5 rounded-2xl'></span>
              <div className='mt-4 space-y-4'>
                <div className='flex items-center gap-3'>
                  <Checkbox id='free' className='cursor-pointer shadow' />
                  <Label htmlFor='free' className='cursor-pointer'>
                    Free
                  </Label>
                </div>
                <div className='flex items-center gap-3'>
                  <Checkbox id='paid' className='cursor-pointer shadow' />
                  <Label htmlFor='paid' className='cursor-pointer'>
                    Paid
                  </Label>
                </div>
              </div>
            </div>
          </div>
          {/* All courses */}
          <div className='flex-1'>
            <div className='grid flex-1 grid-cols-1 gap-x-4 gap-y-8 md:grid-cols-2 xl:grid-cols-3'>
              {courses.slice(0, 6).map((course, idx) => (
                <CourseCard key={idx} course={course} />
              ))}
            </div>
            {/* Pagination */}
            <div className='mt-12 flex items-center justify-between gap-4'>
              <Button size={'icon'} className='rounded-full'>
                <ChevronLeft />
              </Button>
              <div className='flex items-center gap-2'>
                {Array.from({ length: Math.ceil(courses.length / 6) }).map((_, idx) => (
                  <Button key={idx} className='rounded-2xl' variant={'outline'}>
                    {idx + 1}
                  </Button>
                ))}
              </div>
              <Button size={'icon'} className='rounded-full'>
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
