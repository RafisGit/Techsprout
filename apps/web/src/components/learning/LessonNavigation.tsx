'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, CheckCircle2, Trophy } from 'lucide-react';
import type { LessonNavigationDto } from '@techsprout/contracts';

interface LessonNavigationProps {
  courseSlug: string;
  navigation: LessonNavigationDto;
  isCourseCompleted?: boolean;
}

export function LessonNavigation({
  courseSlug,
  navigation,
  isCourseCompleted = false,
}: LessonNavigationProps) {
  const hasPrevious = !!navigation.previousLessonId;
  const hasNext = !!navigation.nextLessonId;

  return (
    <div className='flex items-center justify-between gap-4 pt-4 border-t border-gray-200/80'>
      {/* Previous Button */}
      {hasPrevious ? (
        <Link href={`/learn/${courseSlug}/${navigation.previousLessonId}`}>
          <Button
            variant='outline'
            className='rounded-xl text-xs font-semibold px-4 py-2 border-gray-200 hover:bg-gray-50 text-gray-700'
          >
            <ArrowLeft className='w-4 h-4 mr-1.5' />
            Previous Lesson
          </Button>
        </Link>
      ) : (
        <Button
          variant='outline'
          disabled
          className='rounded-xl text-xs font-semibold px-4 py-2 border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
        >
          <ArrowLeft className='w-4 h-4 mr-1.5' />
          Previous Lesson
        </Button>
      )}

      {/* Next Button or Course Completed Badge */}
      {hasNext ? (
        <Link href={`/learn/${courseSlug}/${navigation.nextLessonId}`}>
          <Button className='rounded-xl text-xs font-bold px-5 py-2 bg-primary text-white hover:bg-primary/90 shadow-xs'>
            Next Lesson
            <ArrowRight className='w-4 h-4 ml-1.5' />
          </Button>
        </Link>
      ) : isCourseCompleted ? (
        <Link href={`/my-courses`}>
          <Button className='rounded-xl text-xs font-bold px-5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'>
            <Trophy className='w-4 h-4 mr-1.5 text-amber-300' />
            Course Completed • Back to Dashboard
          </Button>
        </Link>
      ) : (
        <Button
          disabled
          variant='outline'
          className='rounded-xl text-xs font-semibold px-4 py-2 border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
        >
          End of Curriculum
        </Button>
      )}
    </div>
  );
}
