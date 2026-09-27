import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Blog } from '@/lib/mockData/mockDataTypes';
import Image from 'next/image';
import { TextBadge } from '../ui/text-badge';
import { Calendar, UserRound } from 'lucide-react';
import Title from '../Title';
import { Button } from '../ui/button';
import Link from 'next/link';
import { getSingleUser } from '@/lib/mockData/mockApi';
import { formateDate } from '@/lib/utils';

export function BlogCard({ blog }: { blog: Blog }) {
  const { author, category, image, title, createdAt } = blog;
  const user = getSingleUser(author)!;
  const formattedDate = formateDate(createdAt);

  return (
    <Card className='group text-foreground gap-0 overflow-hidden pt-0 pb-0 shadow-xl'>
      <CardHeader className='p-0'>
        <div className='relative overflow-hidden'>
          <Image
            src={image}
            alt={title}
            className='w-full duration-300 group-hover:scale-110'
            height={250}
            width={365}
          />
          {/* Shine effect on card hover */}
          <div className='absolute inset-0 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full'></div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4 p-6 text-[14px]'>
        <TextBadge className='bg-primary rounded-full text-white'>{category}</TextBadge>
        <CardTitle className='text-lg'>
          <Title h={5}>{title?.slice(0, 50)}...</Title>
        </CardTitle>
        <div className='flex items-center justify-between pt-1'>
          <div className='flex items-center gap-2'>
            <UserRound />
            <span>{user.name}</span>
          </div>
          <div className='flex items-center gap-2'>
            <Calendar />
            <span>{formattedDate}</span>
          </div>
        </div>
        <div className='mt-6 text-right'>
          <Link href={`/blogs/${blog._id}`}>
            <Button size={'lg'} isArrow={true} className='rounded-full' variant={'outline'}>
              Continue Reading
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
