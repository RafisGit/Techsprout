'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Trophy, HelpCircle, BookOpen, Award } from 'lucide-react';
import type { LearningCurriculumDto } from '@techsprout/contracts';
import {
  getAdjacentCurriculumItems,
  getCurriculumItemHref,
} from '@/lib/curriculumUtils';

interface CurriculumItemNavigationProps {
  courseSlug: string;
  curriculum: LearningCurriculumDto | null | undefined;
  currentItemId: string;
  isCourseCompleted?: boolean;
}

export function CurriculumItemNavigation({
  courseSlug,
  curriculum,
  currentItemId,
  isCourseCompleted = false,
}: CurriculumItemNavigationProps) {
  const { previousItem, nextItem } = getAdjacentCurriculumItems(curriculum, currentItemId);

  const prevLabel = previousItem
    ? previousItem.type === 'QUIZ'
      ? 'Previous: Quiz'
      : 'Previous Lesson'
    : 'Previous';

  const nextLabel = nextItem
    ? nextItem.type === 'QUIZ'
      ? 'Next: Quiz'
      : 'Next Lesson'
    : 'Next';

  return (
    <div
      className='flex items-center justify-between gap-4 pt-4 border-t border-gray-200/80'
      data-testid='curriculum-item-navigation'
    >
      {/* Previous Button */}
      {previousItem ? (
        <Link href={getCurriculumItemHref(courseSlug, previousItem)} data-testid='nav-previous-link'>
          <Button
            variant='outline'
            className='rounded-xl text-xs font-semibold px-4 py-2 border-gray-200 hover:bg-gray-50 text-gray-700 flex items-center gap-1.5'
          >
            <ArrowLeft className='w-4 h-4' />
            {previousItem.type === 'QUIZ' && <HelpCircle className='w-3.5 h-3.5 text-indigo-500' />}
            <span>{prevLabel}</span>
          </Button>
        </Link>
      ) : (
        <Button
          variant='outline'
          disabled
          className='rounded-xl text-xs font-semibold px-4 py-2 border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
        >
          <ArrowLeft className='w-4 h-4 mr-1.5' />
          Previous
        </Button>
      )}

      {/* Next Button or Course Completed Badge */}
      {nextItem ? (
        <Link href={getCurriculumItemHref(courseSlug, nextItem)} data-testid='nav-next-link'>
          <Button className='rounded-xl text-xs font-bold px-5 py-2 bg-primary text-white hover:bg-primary/90 shadow-xs flex items-center gap-1.5'>
            <span>{nextLabel}</span>
            {nextItem.type === 'QUIZ' && <HelpCircle className='w-3.5 h-3.5 text-amber-200' />}
            <ArrowRight className='w-4 h-4' />
          </Button>
        </Link>
      ) : isCourseCompleted ? (
        <div className='flex items-center gap-2'>
          <Link href={`/learn/${courseSlug}/certificate`} data-testid='nav-view-certificate-link'>
            <Button className='rounded-xl text-xs font-bold px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center gap-1.5'>
              <Award className='w-4 h-4 text-amber-300' />
              <span>View Certificate</span>
            </Button>
          </Link>
          <Link href='/my-courses' data-testid='nav-completed-link'>
            <Button variant='outline' className='rounded-xl text-xs font-semibold px-3 py-2'>
              Dashboard
            </Button>
          </Link>
        </div>
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
