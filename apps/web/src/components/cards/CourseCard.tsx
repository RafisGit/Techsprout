'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';
import { TextBadge } from '../ui/text-badge';
import { Clock, FileText, Star, Users } from 'lucide-react';
import Title from '../Title';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Course } from '@/lib/mockData/mockDataTypes';
import { getSingleUser, getUserName } from '@/lib/mockData/mockApi';
import Link from 'next/link';

export function CourseCard({ course }: { course: Course }) {
  const {
    thumbnail,
    title,
    _id,
    category,
    price,
    instructor: author,
    duration,
    lessons,
    isFree,
    reviews,
    enrolments,
  } = course;

  const instructor = getUserName(author);
  const instructorImg = getSingleUser(author)?.image;

  return (
    <Link href={`/courses/${_id}`}>
      <Card className='group text-foreground gap-0 overflow-hidden pt-0 pb-0 shadow-xl'>
        <CardHeader className='p-0'>
          <div className='relative overflow-hidden'>
            <Image
              src={thumbnail}
              alt={title}
              className='h-[260px] w-full duration-300 group-hover:scale-110'
              width={375}
              height={250}
            />
            {/* Shine effect on card hover */}
            <div className='absolute inset-0 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full'></div>
            <TextBadge className='bg-primary absolute top-4 left-4 rounded-full text-white'>
              {category}
            </TextBadge>
          </div>
        </CardHeader>
        <CardContent className='space-y-4 p-4 text-[14px] md:p-6'>
          <div className='flex items-center justify-between gap-4 text-base md:text-[0.875rem]'>
            <div className='flex items-center gap-1'>
              <FileText width={20} />
              <span>{lessons?.length} lesson</span>
            </div>
            <div className='flex items-center gap-1'>
              <Clock width={20} />
              <span>{duration}</span>
            </div>
            <div className='flex items-center gap-1'>
              <Users width={20} />
              <span>{enrolments?.length} students</span>
            </div>
          </div>
          <CardTitle className='text-lg'>
            <Title h={5}>{title?.slice(0, 27)}...</Title>
          </CardTitle>
          <div className='flex items-center'>
            {Array.from({ length: 5 }).map((_, idx) => (
              <Star key={idx} className='fill-amber-300 stroke-amber-300' />
            ))}
            <span className='ms-2 mt-1 block'>({reviews?.length})</span>
          </div>
          <div className='flex items-center justify-between border-t-2 pt-4'>
            <div className='flex items-center gap-2 text-lg'>
              <Avatar>
                <AvatarImage src={instructorImg} alt={instructor} />
                <AvatarFallback>LR</AvatarFallback>
              </Avatar>
              <span>{instructor}</span>
            </div>
            {isFree ? (
              <span className='text-primary font-lexend text-xl font-bold'>Free</span>
            ) : (
              <span className='text-primary font-lexend text-xl font-bold'>{price}tk/month</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
