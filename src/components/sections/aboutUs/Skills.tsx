import AnimatedText from '@/components/AnimatedText';
import CategoryCard from '@/components/cards/CategoryCard';
import Title from '@/components/Title';
import { TextBadge } from '@/components/ui/text-badge';
import { getCategories } from '@/lib/mockData/mockApi';

export default function Skills() {
  const categories = getCategories();
  return (
    <section className='py-20'>
      <div className='container mx-auto px-4'>
        <div className='space-y-2 text-center'>
          <TextBadge>Our specialties</TextBadge>
          <Title h={2}>
            Grow You <AnimatedText text='Skills' /> To Advance Your Career Path
          </Title>
        </div>
        <div className='relative col-span-3 mt-8 flex flex-wrap justify-center gap-6'>
          {categories.map((category, idx) => (
            <CategoryCard key={idx} category={category} />
          ))}
        </div>
      </div>
    </section>
  );
}
