import { CourseCard } from '../../cards/CourseCard';
import { TextBadge } from '../.././ui/text-badge';
import Title from '../../Title';
import AnimatedText from '../../AnimatedText';
import { Button } from '../.././ui/button';
import { getCategories, getFeaturedCourses } from '@/lib/mockData/mockApi';

const featuredCategories = getCategories();
const featuredCourses = getFeaturedCourses();

export default function FeaturedCourses() {
  return (
    <section className='common-container py-20 lg:py-[120px]'>
      <div>
        <div className='flex flex-col items-center justify-between gap-12 text-center md:flex-row md:text-left'>
          <div className='space-y-4'>
            <TextBadge>Welcome our Property.</TextBadge>
            <Title h={2}>
              Our <AnimatedText text='Courses' />
            </Title>
          </div>
          <div className='flex flex-wrap items-center justify-center gap-2'>
            {featuredCategories.map((category, idx) => (
              <Button
                key={idx}
                size={'sm'}
                variant={'ghost'}
                className='hover:text-foreground relative text-[15px] capitalize hover:bg-transparent'
              >
                {idx === 0 && (
                  <span className='bg-primary after:bg-primary absolute -top-6 left-1/2 rounded-md px-2 text-white after:absolute after:-bottom-1 after:left-2 after:-z-10 after:h-4 after:w-4 after:rotate-45 after:skew-6'>
                    New
                  </span>
                )}
                {category}
              </Button>
            ))}
          </div>
        </div>
        <div className='mt-16 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3'>
          {featuredCourses?.slice(0, 6)?.map((course) => (
            <CourseCard key={course._id} course={course} />
          ))}
        </div>
      </div>
    </section>
  );
}
