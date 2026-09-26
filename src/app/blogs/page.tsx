import { BlogCard } from '@/components/cards/BlogCard';
import RecentPostCard from '@/components/cards/RecentPostCard';
import Hero from '@/components/Hero';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { getCategories } from '@/lib/mockData/mockApi';
import { blogs } from '@/lib/mockData/mockData';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

export default function page() {
  const categories = getCategories();
  return (
    <>
      <Hero pageName='Blog' />
      <section className='container mx-auto flex flex-col gap-6 px-4 py-20 md:flex-row'>
        {/* All Blogs */}
        <div className='flex-1'>
          <div className='space-y-12'>
            {blogs.slice(0, 4).map((blog) => (
              <BlogCard key={blog._id} blog={blog} />
            ))}
          </div>
          {/* pagination */}
          <div className='mt-12 flex items-center justify-between gap-4'>
            <Button size={'icon'} className='rounded-full'>
              <ChevronLeft />
            </Button>
            <div className='flex items-center gap-2'>
              {Array.from({ length: Math.ceil(categories.length / 4) }).map((_, idx) => (
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
        {/* Filter and recent blogs */}
        <div className='md:w-[300px]'>
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
          <div className='mt-4 h-fit rounded-xl p-4 shadow-2xl'>
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
          <div>
            <div className='mt-4 h-fit rounded-xl p-4 shadow-2xl'>
              <Title h={3}>Recent Post</Title>
              <span className='bg-primary block h-1 w-5 rounded-2xl'></span>
              <div className='mt-4 space-y-6'>
                {blogs.slice(0, 4).map((blog) => (
                  <RecentPostCard key={blog._id} blog={blog} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
