import { Blog } from '@/lib/mockData/mockDataTypes';
import Image from 'next/image';
import Title from '../Title';
import { Calendar } from 'lucide-react';
import { formateDate } from '@/lib/utils';
import Link from 'next/link';

export default function RecentPostCard({ blog }: { blog: Blog }) {
  const { image, createdAt, title, _id } = blog;
  const formattedDate = formateDate(createdAt);

  return (
    <Link href={`/blogs/${_id}`} className='group block'>
      <div className='flex items-center gap-4'>
        <div className='overflow-hidden'>
          <Image src={image} width={80} height={80} alt={title} className='aspect-square' />
        </div>
        <div>
          <Title h={6} className='text-[14px] group-hover:underline'>
            {title.slice(0, 30)}...
          </Title>
          <div className='flex items-center gap-2 text-xs'>
            <Calendar size={12} />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
