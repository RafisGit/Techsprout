import AnimatedText from '../.././AnimatedText';
import Title from '../.././Title';
import { Button } from '../.././ui/button';
import { TextBadge } from '../.././ui/text-badge';
import CategoryCard from '../.././cards/CategoryCard';
import Image from 'next/image';
import shape1 from '@/assets/img/shapes/categories_shape01.png';
import shape2 from '@/assets/img/shapes/categories_shape03.svg';
import shape3 from '@/assets/img/shapes/categories_shape04.svg';
import { getCategories } from '@/lib/mockData/mockApi';
import Link from 'next/link';

export default function SearchByCategory() {
  const categories = getCategories();

  return (
    <section className='bg-white py-20 lg:py-[120px]'>
      <div className='common-container'>
        <div className='grid grid-cols-1 items-center gap-4 xl:grid-cols-5'>
          <div className='relative col-span-2 space-y-8'>
            <Image
              src={shape1}
              width={100}
              alt='shape'
              className='animate-spin-slow absolute -left-1/3'
            />
            <TextBadge>Unique online courses</TextBadge>
            <Title h={2}>
              Browse By <AnimatedText text='Categories' />
            </Title>
            <p>
              Our mission is to inspire curiosity, creativity, and innovation shaping tomorrow’s
              tech leaders today.
            </p>
            <Link href={'/courses'}>
              <Button isArrow={true} size={'lg'}>
                All Categories
              </Button>
            </Link>
          </div>
          <div className='relative col-span-3 flex flex-wrap justify-center gap-6'>
            {categories.map((category, idx) => (
              <CategoryCard key={idx} category={category} />
            ))}
            <Image
              src={shape2}
              width={100}
              alt='shape'
              className='absolute top-1/2 left-0 hidden -translate-y-1/8 lg:block'
            />
            <Image
              src={shape3}
              width={80}
              alt='shape'
              className='absolute top-1/2 right-0 hidden -translate-y-1/8 lg:block'
            />
          </div>
        </div>
      </div>
    </section>
  );
}
