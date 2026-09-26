import { getCourseCount } from '@/lib/mockData/mockApi';
import Title from '../Title';
import {
  ChartNoAxesCombined,
  FolderCode,
  LayoutTemplate,
  Paintbrush,
  Search,
  SettingsIcon,
} from 'lucide-react';

export default function CategoryCard({ category }: { category: string }) {
  const courseCount = getCourseCount(category);
  return (
    <div className='group bg-primary/20 flex w-56 flex-col items-center justify-center space-y-2 rounded-2xl p-8 text-center xl:w-48'>
      <div className='group-hover:bg-accent w-fit rounded-full bg-white p-6 duration-300 group-hover:text-white'>
        {category === 'Web Development' ? (
          <FolderCode />
        ) : category === 'Digital Marketing' ? (
          <ChartNoAxesCombined />
        ) : category === 'SEO' ? (
          <Search />
        ) : category === 'Graphics Design' ? (
          <Paintbrush />
        ) : category === 'Web Design' ? (
          <LayoutTemplate />
        ) : (
          <SettingsIcon />
        )}
      </div>
      <Title h={6}>{category}</Title>
      <p>0{courseCount} Courses</p>
    </div>
  );
}
