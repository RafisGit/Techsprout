'use client';

import React from 'react';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Video,
  FileText,
  FileCheck,
  CheckCircle2,
  Circle,
  PlayCircle,
  BookOpen,
  HelpCircle,
} from 'lucide-react';
import type {
  LearningCurriculumDto,
  CurriculumModuleDto,
  CurriculumItemDto,
} from '@techsprout/contracts';
import { useTranslation } from '@/i18n';

interface CurriculumSidebarProps {
  curriculum: LearningCurriculumDto;
  courseSlug: string;
  activeLessonId?: string;
  activeQuizId?: string;
  activeItemId?: string;
  onSelectLesson?: (lessonId: string) => void;
  onSelectItem?: (itemId: string, type: 'LESSON' | 'QUIZ') => void;
}

export function CurriculumSidebar({
  curriculum,
  courseSlug,
  activeLessonId,
  activeQuizId,
  activeItemId,
}: CurriculumSidebarProps) {
  const { t, formatNumber } = useTranslation();
  const currentActiveId = activeItemId || activeQuizId || activeLessonId;

  const modules = (curriculum.modules || []).slice().sort((a, b) => a.position - b.position);
  const defaultExpanded = modules.map((m) => m.id);

  // Completed items count across entire curriculum
  const totalCompleted =
    (curriculum.completedLessonsCount || 0) + (curriculum.passedQuizzesCount || 0);
  const totalCount =
    (curriculum.totalLessonsCount || 0) + (curriculum.publishedQuizzesCount || 0);

  function formatLessonDuration(seconds?: number | null): string {
    if (!seconds) return t('catalog.mins', { count: formatNumber(5) });
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${formatNumber(secs)}s`;
    return secs > 0
      ? `${formatNumber(mins)}m ${formatNumber(secs)}s`
      : t('catalog.mins', { count: formatNumber(mins) });
  }

  return (
    <div className='flex flex-col h-full bg-white' data-testid='curriculum-sidebar'>
      {/* Sidebar Header */}
      <div className='p-4 border-b border-gray-100 flex items-center justify-between'>
        <div className='flex items-center space-x-2 text-gray-900 font-bold text-sm'>
          <BookOpen className='w-4 h-4 text-primary' />
          <span>{t('courseDetails.curriculum')}</span>
        </div>
        <span className='text-xs text-gray-500 font-medium' data-testid='curriculum-completion-stats'>
          {formatNumber(totalCompleted)} / {formatNumber(totalCount)} {t('learning.completedBadge')}
        </span>
      </div>

      {/* Modules Accordion */}
      <div className='flex-1 overflow-y-auto p-3 space-y-2.5'>
        {modules.length === 0 ? (
          <div className='p-6 text-center text-xs text-gray-400'>
            {t('states.empty')}
          </div>
        ) : (
          <Accordion
            type='multiple'
            defaultValue={defaultExpanded}
            className='space-y-2'
          >
            {modules.map((mod: CurriculumModuleDto, mIdx: number) => {
              const items: CurriculumItemDto[] =
                mod.items && mod.items.length > 0
                  ? mod.items
                  : (mod.lessons || []).slice().sort((a, b) => a.position - b.position).map((l) => ({
                      ...l,
                      type: 'LESSON' as const,
                    }));

              const completedInMod = items.filter((it) => {
                if (it.type === 'LESSON') {
                  return it.progress?.status === 'COMPLETED';
                }
                return it.isPassed;
              }).length;

              return (
                <AccordionItem
                  key={mod.id}
                  value={mod.id}
                  className='border border-gray-200/80 rounded-2xl overflow-hidden bg-gray-50/40'
                  data-testid={`curriculum-module-${mod.id}`}
                >
                  <AccordionTrigger className='hover:no-underline px-3.5 py-2.5 text-left font-semibold text-gray-800 text-xs sm:text-sm cursor-pointer'>
                    <div className='flex items-center justify-between w-full pr-2 gap-2'>
                      <span className='truncate font-bold'>
                        {formatNumber(mIdx + 1)}. {mod.title}
                      </span>
                      <span className='text-[11px] text-gray-400 font-normal shrink-0'>
                        {formatNumber(completedInMod)}/{formatNumber(items.length)}
                      </span>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className='pt-1 pb-2 px-2 space-y-1 border-t border-gray-100 mt-0.5 bg-white'>
                    {items.map((item: CurriculumItemDto) => {
                      const isActive = item.id === currentActiveId;

                      if (item.type === 'QUIZ') {
                        const isQuizPassed = item.isPassed;
                        const quizHref = `/learn/${courseSlug}/quiz/${item.id}`;

                        return (
                          <Link
                            key={`quiz-${item.id}`}
                            href={quizHref}
                            className={`flex items-center justify-between p-2 rounded-xl text-xs transition group cursor-pointer ${
                              isActive
                                ? 'bg-primary/10 text-primary font-bold shadow-2xs'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                            data-testid={`curriculum-item-${item.id}`}
                          >
                            <div className='flex items-center space-x-2.5 truncate'>
                              <div
                                className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                                  isQuizPassed
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-indigo-50 text-indigo-700'
                                }`}
                              >
                                <HelpCircle className='w-3.5 h-3.5' />
                              </div>
                              <span className='truncate'>{item.title}</span>
                            </div>

                            <div className='flex items-center space-x-1.5 shrink-0 pl-2'>
                              {isQuizPassed ? (
                                <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600' />
                              ) : (
                                <span className='text-[10px] text-indigo-600 font-semibold px-1.5 py-0.5 rounded bg-indigo-50'>
                                  {t('quiz.knowledgeCheck')}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      }

                      // LESSON item
                      const isCompleted = item.progress?.status === 'COMPLETED';
                      const lessonHref = `/learn/${courseSlug}/${item.id}`;

                      return (
                        <Link
                          key={`lesson-${item.id}`}
                          href={lessonHref}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs transition group cursor-pointer ${
                            isActive
                              ? 'bg-primary/10 text-primary font-bold shadow-2xs'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                          data-testid={`curriculum-item-${item.id}`}
                        >
                          <div className='flex items-center space-x-2.5 truncate'>
                            <div className='shrink-0 text-gray-400 group-hover:text-primary transition'>
                              {isCompleted ? (
                                <CheckCircle2 className='w-4 h-4 text-emerald-600' />
                              ) : isActive ? (
                                <PlayCircle className='w-4 h-4 text-primary' />
                              ) : (
                                <Circle className='w-4 h-4' />
                              )}
                            </div>

                            <span className='truncate'>{item.title}</span>
                          </div>

                          <div className='flex items-center space-x-1.5 shrink-0 pl-2 text-[11px] text-gray-400'>
                            {item.lessonType === 'VIDEO' && <Video className='w-3 h-3 text-gray-400' />}
                            {item.lessonType === 'PDF' && <FileCheck className='w-3 h-3 text-gray-400' />}
                            {item.lessonType === 'TEXT' && <FileText className='w-3 h-3 text-gray-400' />}
                            <span>{formatLessonDuration(item.durationSeconds)}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </div>
  );
}
