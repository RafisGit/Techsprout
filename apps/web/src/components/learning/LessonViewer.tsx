'use client';

import React, { useState } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileCheck,
  FileText,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import type { LearningLessonContentDto } from '@techsprout/contracts';

interface LessonViewerProps {
  courseId: string;
  courseSlug: string;
  lesson: LearningLessonContentDto;
  onToggleComplete: (completed: boolean) => Promise<void>;
  onLessonCompleted: () => void;
  onProgressUpdate?: (courseProgressPct: number) => void;
}

export function LessonViewer({
  courseId,
  courseSlug,
  lesson,
  onToggleComplete,
  onLessonCompleted,
  onProgressUpdate,
}: LessonViewerProps) {
  const [isToggling, setIsToggling] = useState(false);
  const isCompleted = lesson.progress?.status === 'COMPLETED';

  const handleToggle = async () => {
    try {
      setIsToggling(true);
      await onToggleComplete(!isCompleted);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className='space-y-6'>
      {/* Lesson Content Area by Type */}
      {lesson.lessonType === 'VIDEO' && (
        <div className='space-y-4'>
          {lesson.mediaUrl ? (
            <VideoPlayer
              courseId={courseId}
              lessonId={lesson.id}
              mediaUrl={lesson.mediaUrl}
              initialWatchPosition={lesson.progress?.watchPositionSeconds || 0}
              durationSeconds={lesson.durationSeconds}
              isCompleted={isCompleted}
              onCompleted={onLessonCompleted}
              onProgressUpdate={onProgressUpdate}
            />
          ) : (
            <div className='aspect-video w-full rounded-2xl bg-gray-100 flex flex-col items-center justify-center p-6 text-center text-gray-500 space-y-2'>
              <AlertTriangle className='w-8 h-8 text-amber-500' />
              <p className='text-sm font-semibold text-gray-800'>Video stream is currently unavailable</p>
              <p className='text-xs text-gray-400'>
                The media file for this lesson may still be processing on the server.
              </p>
            </div>
          )}
        </div>
      )}

      {lesson.lessonType === 'TEXT' && (
        <div className='bg-white rounded-3xl border border-gray-200/80 p-6 sm:p-8 shadow-xs space-y-6'>
          <div className='flex items-center space-x-2 text-xs font-bold text-primary uppercase tracking-wider pb-3 border-b border-gray-100'>
            <FileText className='w-4 h-4' />
            <span>Reading Material</span>
          </div>

          <div className='prose prose-slate max-w-none text-gray-700 leading-relaxed text-sm sm:text-base whitespace-pre-wrap font-sans'>
            {lesson.content || 'No text content provided for this lesson.'}
          </div>
        </div>
      )}

      {lesson.lessonType === 'PDF' && (
        <div className='bg-white rounded-3xl border border-gray-200/80 p-6 sm:p-8 shadow-xs space-y-4'>
          <div className='flex items-center justify-between pb-3 border-b border-gray-100'>
            <div className='flex items-center space-x-2 text-xs font-bold text-primary uppercase tracking-wider'>
              <FileCheck className='w-4 h-4' />
              <span>Document Reader</span>
            </div>
            {lesson.mediaUrl && (
              <a
                href={lesson.mediaUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-semibold'
              >
                <span>Open in New Tab</span>
                <ExternalLink className='w-3.5 h-3.5' />
              </a>
            )}
          </div>

          {lesson.mediaUrl ? (
            <div className='w-full rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 h-[500px] sm:h-[650px]'>
              <iframe
                src={`${lesson.mediaUrl}#toolbar=1`}
                title={lesson.title}
                className='w-full h-full'
              />
            </div>
          ) : (
            <div className='p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-xs text-gray-400'>
              PDF document is currently unavailable.
            </div>
          )}
        </div>
      )}

      {/* Fallback for unsupported lesson type */}
      {lesson.lessonType !== 'VIDEO' &&
        lesson.lessonType !== 'TEXT' &&
        lesson.lessonType !== 'PDF' && (
          <div className='bg-white rounded-3xl border border-gray-200 p-8 text-center space-y-3'>
            <AlertTriangle className='w-8 h-8 text-amber-500 mx-auto' />
            <h3 className='text-sm font-bold text-gray-900'>Unsupported Lesson Format</h3>
            <p className='text-xs text-gray-500'>
              This lesson content format is not supported by the web player.
            </p>
          </div>
        )}

      {/* Lesson Details & Explicit Completion Action Bar */}
      <div className='bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs'>
        <div className='space-y-1'>
          <h2 className='text-lg font-bold text-gray-900'>{lesson.title}</h2>
          <div className='flex items-center gap-2 text-xs text-gray-400'>
            <span>Type: <strong className='text-gray-600 capitalize'>{lesson.lessonType.toLowerCase()}</strong></span>
            <span>•</span>
            <span>Status: <strong className={isCompleted ? 'text-emerald-600' : 'text-primary'}>
              {isCompleted ? 'Completed' : 'In Progress'}
            </strong></span>
          </div>
        </div>

        {/* Mark Complete Button (for TEXT and PDF, or manual override for VIDEO) */}
        <div>
          <Button
            onClick={handleToggle}
            disabled={isToggling}
            variant={isCompleted ? 'outline' : 'default'}
            className={`rounded-xl text-xs font-bold px-4 py-2 transition-all ${
              isCompleted
                ? 'border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100/60'
                : 'bg-primary text-white hover:bg-primary/90 shadow-xs'
            }`}
          >
            {isCompleted ? (
              <>
                <CheckCircle2 className='w-4 h-4 mr-1.5 text-emerald-600' />
                Completed
              </>
            ) : (
              <>
                <Circle className='w-4 h-4 mr-1.5' />
                Mark Complete
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
