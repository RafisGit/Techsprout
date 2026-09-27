import Brands from '@/components/sections/home/Brands';
import FeaturedCourses from '@/components/sections/home/FeaturedCourses';
import SearchByCategory from '@/components/sections/home/SearchByCategory';
import TopInstructors from '@/components/sections/home/TopInstructors';
import Cta from '@/components/Cta';
import LatestBlogs from '@/components/sections/home/LatestBlogs';
import NewsLetter from '@/components/NewsLetter';
import Testimonial from '@/components/sections/home/Testimonial';
import Banner from '@/components/sections/home/Banner';
import Discover from '@/components/sections/home/Discover';

export default function Home() {
  return (
    <>
      <main>
        <Banner />
        <Brands />
        <Discover />
        <FeaturedCourses />
        <SearchByCategory />
        <Testimonial />
        <TopInstructors />
        <div className='relative -top-[80px]'>
          <Cta />
        </div>
        <LatestBlogs />
        <NewsLetter />
      </main>
    </>
  );
}
