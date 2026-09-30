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
} from 'lucide-react';
import type { LearningCurriculumDto, CurriculumModuleDto, CurriculumLessonDto } from '@techsprout/contracts';

interface CurriculumSidebarProps {
  curriculum: LearningCurriculumDto;
  courseSlug: string;
  activeLessonId?: string;
  onSelectLesson?: (lessonId: string) => void;
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
  onSelectLesson,
}: CurriculumSidebarProps) {
  const modules = (curriculum.modules || []).slice().sort((a, b) => a.position - b.position);

  // Find module containing the active lesson to ensure it's expanded
  const activeModuleId = modules.find((m) =>
    m.lessons.some((l) => l.id === activeLessonId)
  )?.id;

  const defaultExpanded = modules.map((m) => m.id);

  return (
    <div className='flex flex-col h-full bg-white'>
      {/* Sidebar Header */}
      <div className='p-4 border-b border-gray-100 flex items-center justify-between'>
        <div className='flex items-center space-x-2 text-gray-900 font-bold text-sm'>
          <BookOpen className='w-4 h-4 text-primary' />
          <span>Course Curriculum</span>
        </div>
        <span className='text-xs text-gray-500 font-medium'>
          {curriculum.completedLessonsCount} / {curriculum.totalLessonsCount} completed
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
              const sortedLessons = (mod.lessons || []).slice().sort((a, b) => a.position - b.position);
              const completedInMod = sortedLessons.filter(
                (l) => l.progress?.status === 'COMPLETED'
              ).length;

              return (
                <AccordionItem
                  key={mod.id}
                  value={mod.id}
                  className='border border-gray-200/80 rounded-2xl overflow-hidden bg-gray-50/40'
                >
                  <AccordionTrigger className='hover:no-underline px-3.5 py-2.5 text-left font-semibold text-gray-800 text-xs sm:text-sm'>
                    <div className='flex items-center justify-between w-full pr-2 gap-2'>
                      <span className='truncate font-bold'>
                        Section {mIdx + 1}: {mod.title}
                      </span>
                      <span className='text-[11px] text-gray-400 font-normal shrink-0'>
                        {completedInMod}/{sortedLessons.length}
                      </span>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className='pt-1 pb-2 px-2 space-y-1 border-t border-gray-100 mt-0.5 bg-white'>
                    {sortedLessons.map((lesson: CurriculumLessonDto) => {
                      const isActive = lesson.id === activeLessonId;
                      const isCompleted = lesson.progress?.status === 'COMPLETED';

                      return (
                        <Link
                          key={lesson.id}
                          href={`/learn/${courseSlug}/${lesson.id}`}
                          onClick={() => onSelectLesson?.(lesson.id)}
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
                            {lesson.lessonType === 'VIDEO' ? (
                              <Video
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isActive ? 'text-primary' : 'text-gray-400'
                                }`}
                              />
                            ) : lesson.lessonType === 'PDF' ? (
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
                              {lesson.title}
                            </span>
                          </div>

                          <span className='text-[10px] text-gray-400 shrink-0 font-medium'>
                            {formatLessonDuration(lesson.durationSeconds)}
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
    </div>
  );
}
