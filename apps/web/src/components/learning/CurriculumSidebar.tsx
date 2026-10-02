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
  Award,
} from 'lucide-react';
import type {
  LearningCurriculumDto,
  CurriculumModuleDto,
  CurriculumItemDto,
  CurriculumLessonDto,
  CurriculumQuizItemDto,
} from '@techsprout/contracts';

interface CurriculumSidebarProps {
  curriculum: LearningCurriculumDto;
  courseSlug: string;
  activeLessonId?: string;
  activeQuizId?: string;
  activeItemId?: string;
  onSelectLesson?: (lessonId: string) => void;
  onSelectItem?: (itemId: string, type: 'LESSON' | 'QUIZ') => void;
}

function formatLessonDuration(seconds?: number | null): string {
  if (!seconds) return '5 mins';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function CurriculumSidebar({
  curriculum,
  courseSlug,
  activeLessonId,
  activeQuizId,
  activeItemId,
  onSelectLesson,
  onSelectItem,
}: CurriculumSidebarProps) {
  const currentActiveId = activeItemId || activeQuizId || activeLessonId;

  const modules = (curriculum.modules || []).slice().sort((a, b) => a.position - b.position);

  // Find module containing the active item to ensure it's expanded by default
  const activeModuleId = modules.find((m) => {
    if (m.items && m.items.length > 0) {
      return m.items.some((it) => it.id === currentActiveId);
    }
    return m.lessons?.some((l) => l.id === currentActiveId);
  })?.id;

  const defaultExpanded = modules.map((m) => m.id);

  // Completed items count across entire curriculum
  const totalCompleted =
    (curriculum.completedLessonsCount || 0) + (curriculum.passedQuizzesCount || 0);
  const totalCount =
    (curriculum.totalLessonsCount || 0) + (curriculum.publishedQuizzesCount || 0);

  return (
    <div className='flex flex-col h-full bg-white' data-testid='curriculum-sidebar'>
      {/* Sidebar Header */}
      <div className='p-4 border-b border-gray-100 flex items-center justify-between'>
        <div className='flex items-center space-x-2 text-gray-900 font-bold text-sm'>
          <BookOpen className='w-4 h-4 text-primary' />
          <span>Course Curriculum</span>
        </div>
        <span className='text-xs text-gray-500 font-medium' data-testid='curriculum-completion-stats'>
          {totalCompleted} / {totalCount} completed
        </span>
      </div>

      {/* Modules Accordion */}
      <div className='flex-1 overflow-y-auto p-3 space-y-2.5'>
        {modules.length === 0 ? (
          <div className='p-6 text-center text-xs text-gray-400'>
            No modules available in this course.
          </div>
        ) : (
          <Accordion
            type='multiple'
            defaultValue={defaultExpanded}
            className='space-y-2'
          >
            {modules.map((mod: CurriculumModuleDto, mIdx: number) => {
              // Authoritative source: module.items
              // Fallback for legacy mocks: module.lessons
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
                  <AccordionTrigger className='hover:no-underline px-3.5 py-2.5 text-left font-semibold text-gray-800 text-xs sm:text-sm'>
                    <div className='flex items-center justify-between w-full pr-2 gap-2'>
                      <span className='truncate font-bold'>
                        Section {mIdx + 1}: {mod.title}
                      </span>
                      <span className='text-[11px] text-gray-400 font-normal shrink-0'>
                        {completedInMod}/{items.length}
                      </span>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className='pt-1 pb-2 px-2 space-y-1 border-t border-gray-100 mt-0.5 bg-white'>
                    {items.map((item: CurriculumItemDto) => {
                      const isActive = item.id === currentActiveId;

                      if (item.type === 'QUIZ') {
                        const isPassed = item.isPassed;
                        const isFinalExam = item.quizType === 'FINAL_EXAM';

                        return (
                          <Link
                            key={item.id}
                            href={`/learn/${courseSlug}/quiz/${item.id}`}
                            onClick={() => {
                              onSelectItem?.(item.id, 'QUIZ');
                            }}
                            data-testid={`curriculum-quiz-item-${item.id}`}
                            className={`flex items-center justify-between p-2.5 rounded-xl transition text-xs group ${
                              isActive
                                ? 'bg-primary/10 text-primary font-bold shadow-2xs border border-primary/20'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <div className='flex items-center space-x-2.5 truncate pr-2'>
                              {/* Completion Icon */}
                              {isPassed ? (
                                <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0' />
                              ) : isActive ? (
                                <PlayCircle className='w-4 h-4 text-primary shrink-0' />
                              ) : (
                                <Circle className='w-4 h-4 text-gray-300 shrink-0' />
                              )}

                              {/* Quiz Type Icon */}
                              {isFinalExam ? (
                                <Award
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive ? 'text-primary' : 'text-amber-600'
                                  }`}
                                />
                              ) : (
                                <HelpCircle
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isActive ? 'text-primary' : 'text-indigo-600'
                                  }`}
                                />
                              )}

                              <div className='flex items-center gap-1.5 truncate'>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                                    isFinalExam
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                  }`}
                                >
                                  {isFinalExam ? 'Exam' : 'Quiz'}
                                </span>
                                <span className='truncate leading-tight'>
                                  {item.title}
                                </span>
                              </div>
                            </div>

                            <span className='text-[10px] text-gray-400 shrink-0 font-medium'>
                              {item.timeLimitMinutes
                                ? `${item.timeLimitMinutes}m`
                                : `${item.questionsCount} Qs`}
                            </span>
                          </Link>
                        );
                      }

                      // LESSON item
                      const isCompleted = item.progress?.status === 'COMPLETED';

                      return (
                        <Link
                          key={item.id}
                          href={`/learn/${courseSlug}/${item.id}`}
                          onClick={() => {
                            onSelectLesson?.(item.id);
                            onSelectItem?.(item.id, 'LESSON');
                          }}
                          data-testid={`curriculum-lesson-item-${item.id}`}
                          className={`flex items-center justify-between p-2.5 rounded-xl transition text-xs group ${
                            isActive
                              ? 'bg-primary/10 text-primary font-bold shadow-2xs'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className='flex items-center space-x-2.5 truncate pr-2'>
                            {/* Completion Status Icon */}
                            {isCompleted ? (
                              <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0' />
                            ) : isActive ? (
                              <PlayCircle className='w-4 h-4 text-primary shrink-0' />
                            ) : (
                              <Circle className='w-4 h-4 text-gray-300 shrink-0' />
                            )}

                            {/* Lesson Type Icon */}
                            {item.lessonType === 'VIDEO' ? (
                              <Video
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isActive ? 'text-primary' : 'text-gray-400'
                                }`}
                              />
                            ) : item.lessonType === 'PDF' ? (
                              <FileCheck
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isActive ? 'text-primary' : 'text-gray-400'
                                }`}
                              />
                            ) : (
                              <FileText
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isActive ? 'text-primary' : 'text-gray-400'
                                }`}
                              />
                            )}

                            <span className='truncate leading-tight'>
                              {item.title}
                            </span>
                          </div>

                          <span className='text-[10px] text-gray-400 shrink-0 font-medium'>
                            {formatLessonDuration(item.durationSeconds)}
                          </span>
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

      {/* Sidebar Footer: Course Certificate Navigation */}
      <div className='p-3 border-t border-gray-100 bg-gray-50/60'>
        <Link
          href={`/learn/${courseSlug}/certificate`}
          className='w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:text-emerald-700 bg-white hover:bg-emerald-50/80 border border-gray-200 hover:border-emerald-200 transition shadow-2xs'
          data-testid='sidebar-btn-certificate'
          title='View official course certificate'
        >
          <Award className='w-3.5 h-3.5 text-amber-500' />
          <span>Course Certificate</span>
        </Link>
      </div>
    </div>
  );
}
