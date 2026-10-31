'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';
import { TextBadge } from '../ui/text-badge';
import { Clock, FileText, Layers } from 'lucide-react';
import Title from '../Title';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import Link from 'next/link';
import type { CourseDto } from '@techsprout/contracts';
import { useTranslation } from '@/i18n';

interface CourseCardProps {
  course: CourseDto | any;
}

export function CourseCard({ course }: CourseCardProps) {
  const { t, locale, formatNumber, formatCurrency } = useTranslation();

  const slug = course.slug || course._id;
  const title = course.title || 'Untitled Course';
  const categoryName =
    course.category?.name ||
    (typeof course.category === 'string' ? course.category : t('catalog.categories'));

  const instructorName =
    course.instructor?.name ||
    (typeof course.instructor === 'string' ? course.instructor : t('courseDetails.instructor'));

  const instructorInitials = instructorName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const lessonsCount =
    course.lessonsCount !== undefined
      ? course.lessonsCount
      : course.lessons?.length !== undefined
      ? course.lessons.length
      : 0;

  let durationText = t('catalog.flexibleDuration');
  if (course.durationMinutes !== undefined && course.durationMinutes !== null && course.durationMinutes > 0) {
    const mins = course.durationMinutes;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (mins < 60) {
      durationText = t('catalog.mins', { count: formatNumber(mins) });
    } else if (remMins > 0) {
      durationText = t('catalog.hoursMins', {
        hours: formatNumber(hours),
        mins: formatNumber(remMins),
      });
    } else {
      durationText = t('catalog.hoursOnly', { hours: formatNumber(hours) });
    }
  }

  const levelKey = (course.level || '').toLowerCase();
  const levelText =
    levelKey === 'beginner'
      ? t('catalog.beginner')
      : levelKey === 'intermediate'
      ? t('catalog.intermediate')
      : levelKey === 'advanced'
      ? t('catalog.advanced')
      : t('catalog.allLevels');

  const isFree =
    Number(course.price) === 0 || course.isFree === true || course.price === '0.00';

  const formattedPrice = isFree
    ? t('catalog.free')
    : formatCurrency(course.price, course.currency || 'BDT');

  const thumbnailUrl = course.thumbnailUrl || course.thumbnail;

  return (
    <Link href={`/courses/${slug}`}>
      <Card className='group text-foreground gap-0 overflow-hidden pt-0 pb-0 shadow-xl transition-all duration-300 hover:shadow-2xl h-full flex flex-col justify-between'>
        <CardHeader className='p-0'>
          <div className='relative overflow-hidden bg-gray-100 h-[240px] w-full'>
            {thumbnailUrl ? (
              <Image
                src={thumbnailUrl}
                alt={title}
                className='h-full w-full object-cover duration-300 group-hover:scale-105'
                width={400}
                height={260}
                sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
              />
            ) : (
              <div className='h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-gray-100 text-gray-400'>
                <span className='font-semibold text-sm'>TechSprout Academy</span>
              </div>
            )}

            {/* Shine effect on card hover */}
            <div className='absolute inset-0 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full'></div>

            <TextBadge className='bg-primary absolute top-4 left-4 rounded-full text-white shadow-xs font-medium'>
              {categoryName}
            </TextBadge>
          </div>
        </CardHeader>

        <CardContent className='space-y-4 p-4 text-[14px] md:p-6 flex-1 flex flex-col justify-between'>
          <div className='space-y-3'>
            <div className='flex items-center justify-between gap-2 text-xs md:text-sm text-gray-500'>
              <div className='flex items-center gap-1.5'>
                <FileText className='w-4 h-4 text-primary shrink-0' />
                <span>
                  {lessonsCount === 1
                    ? t('catalog.singleLesson')
                    : t('catalog.lessonsCount', { count: formatNumber(lessonsCount) })}
                </span>
              </div>
              <div className='flex items-center gap-1.5'>
                <Clock className='w-4 h-4 text-primary shrink-0' />
                <span>{durationText}</span>
              </div>
              <div className='flex items-center gap-1.5 capitalize'>
                <Layers className='w-4 h-4 text-primary shrink-0' />
                <span>{levelText}</span>
              </div>
            </div>

            <CardTitle className='text-lg leading-snug line-clamp-2'>
              <Title h={5} className='font-semibold text-gray-900 group-hover:text-primary transition-colors'>
                {title}
              </Title>
            </CardTitle>
          </div>

          <div className='flex items-center justify-between border-t border-gray-100 pt-4 mt-auto'>
            <div className='flex items-center gap-2.5 text-sm font-medium text-gray-700'>
              <Avatar className='w-8 h-8 border border-gray-200'>
                {course.instructor?.image ? (
                  <AvatarImage src={course.instructor.image} alt={instructorName} />
                ) : null}
                <AvatarFallback className='bg-primary/10 text-primary text-xs font-bold'>
                  {instructorInitials || 'TS'}
                </AvatarFallback>
              </Avatar>
              <span className='truncate max-w-[130px]'>{instructorName}</span>
            </div>

            <span className='text-primary font-lexend text-lg font-bold'>
              {formattedPrice}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
