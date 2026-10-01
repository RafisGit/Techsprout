'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Award,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Eye,
  ArrowRight,
  Trophy,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type {
  StudentQuizResultDto,
  StudentQuizDto,
  LearningCurriculumDto,
} from '@techsprout/contracts';
import {
  getAdjacentCurriculumItems,
  getCurriculumItemHref,
} from '@/lib/curriculumUtils';

interface QuizResultsProps {
  result: StudentQuizResultDto;
  quiz: StudentQuizDto;
  courseSlug: string;
  curriculum?: LearningCurriculumDto | null;
  onRetry?: () => void;
  onViewReview: () => void;
  isRetrying?: boolean;
  isEnrollmentCompleted?: boolean;
}

export function QuizResults({
  result,
  quiz,
  courseSlug,
  curriculum,
  onRetry,
  onViewReview,
  isRetrying = false,
  isEnrollmentCompleted = false,
}: QuizResultsProps) {
  const isPassed = result.isPassed;
  const isUnlimitedAttempts = quiz.maxAttempts === null || quiz.maxAttempts === undefined;
  const attemptsUsed = Math.max(quiz.userAttemptsCount || 0, result.attemptNumber);
  const maxAttempts = quiz.maxAttempts;
  const attemptsRemaining = isUnlimitedAttempts ? null : Math.max(0, (maxAttempts || 0) - attemptsUsed);
  const canRetry = !isEnrollmentCompleted && (isUnlimitedAttempts || (attemptsRemaining !== null && attemptsRemaining > 0));

  // Determine next curriculum item
  const { nextItem } = getAdjacentCurriculumItems(curriculum, quiz.id);

  return (
    <div
      className='bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs'
      data-testid='quiz-results'
    >
      {/* Result Status Banner */}
      <div
        className={`p-6 rounded-2xl border flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left ${
          isPassed
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : 'bg-rose-50/70 border-rose-200 text-rose-950'
        }`}
        data-testid={isPassed ? 'result-passed' : 'result-failed'}
      >
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
            isPassed ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
          }`}
        >
          {isPassed ? (
            <CheckCircle2 className='w-8 h-8' />
          ) : (
            <XCircle className='w-8 h-8' />
          )}
        </div>

        <div className='space-y-1 flex-1'>
          <div className='flex flex-wrap items-center justify-center sm:justify-start gap-2'>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                isPassed
                  ? 'bg-emerald-200/60 text-emerald-800'
                  : 'bg-rose-200/60 text-rose-800'
              }`}
            >
              {isPassed ? 'Passed' : 'Not Passed'}
            </span>
            <span className='text-xs text-gray-500'>Attempt #{result.attemptNumber}</span>
          </div>

          <h2 className='text-xl sm:text-2xl font-bold leading-tight'>
            {isPassed
              ? 'Congratulations! You passed the assessment.'
              : 'Keep going! Passing grade not yet achieved.'}
          </h2>

          <p className='text-xs sm:text-sm text-gray-600 leading-relaxed'>
            {isPassed
              ? 'Your score meets the passing requirements. Progress has been saved to your course record.'
              : `You scored ${result.percentage}%. The passing threshold for this quiz is ${quiz.passingScorePercentage}%. You can review your answers and retry if attempts remain.`}
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        {/* Score Percentage */}
        <div className='p-4 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-1'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center gap-1.5'>
            <TrendingUp className='w-3.5 h-3.5 text-gray-400' />
            Your Score
          </span>
          <span
            className={`text-xl sm:text-2xl font-bold ${
              isPassed ? 'text-emerald-600' : 'text-rose-600'
            }`}
            data-testid='stat-result-percentage'
          >
            {result.percentage}%
          </span>
        </div>

        {/* Passing Threshold */}
        <div className='p-4 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-1'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center gap-1.5'>
            <ShieldCheck className='w-3.5 h-3.5 text-gray-400' />
            Passing Threshold
          </span>
          <span className='text-xl sm:text-2xl font-bold text-gray-900'>
            {quiz.passingScorePercentage}%
          </span>
        </div>

        {/* Points Earned */}
        <div className='p-4 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-1'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center gap-1.5'>
            <Award className='w-3.5 h-3.5 text-gray-400' />
            Points
          </span>
          <span className='text-xl sm:text-2xl font-bold text-gray-900' data-testid='stat-result-points'>
            {result.score} / {result.totalPoints}
          </span>
        </div>

        {/* Course Progress */}
        <div className='p-4 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-1'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center gap-1.5'>
            <Trophy className='w-3.5 h-3.5 text-amber-500' />
            Course Progress
          </span>
          <span className='text-xl sm:text-2xl font-bold text-primary'>
            {result.courseProgressPercentage}%
          </span>
        </div>
      </div>

      {/* Course Completion Banner (if triggered) */}
      {result.isCourseCompleted && (
        <div className='p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 flex items-center gap-3'>
          <Trophy className='w-5 h-5 text-amber-600 shrink-0' />
          <div>
            <span className='font-bold'>All Curriculum Requirements Satisfied! </span>
            You have successfully completed 100% of the lessons and assessments in this course.
          </div>
        </div>
      )}

      {/* Attempts Feedback Info */}
      <div className='p-3.5 rounded-xl bg-gray-50 text-xs text-gray-600 flex items-center justify-between'>
        <span>Remaining Attempts:</span>
        <span className='font-bold text-gray-900'>
          {isUnlimitedAttempts ? (
            'Unlimited'
          ) : attemptsRemaining !== null && attemptsRemaining > 0 ? (
            `${attemptsRemaining} remaining (${attemptsUsed} of ${maxAttempts} used)`
          ) : (
            'No attempts remaining'
          )}
        </span>
      </div>

      {/* Action Controls */}
      <div className='flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100'>
        <div className='flex flex-wrap items-center gap-2.5'>
          {/* Review Answers Button */}
          <Button
            type='button'
            variant='outline'
            onClick={onViewReview}
            className='rounded-xl text-xs font-semibold px-4 py-2.5 border-gray-200 hover:bg-gray-50 flex items-center gap-1.5'
            data-testid='btn-view-review'
          >
            <Eye className='w-4 h-4 text-gray-500' />
            <span>Review Answers</span>
          </Button>

          {/* Retry Button */}
          {canRetry && onRetry && (
            <Button
              type='button'
              variant='outline'
              onClick={onRetry}
              disabled={isRetrying}
              className='rounded-xl text-xs font-semibold px-4 py-2.5 border-gray-200 hover:bg-gray-50 text-gray-700 flex items-center gap-1.5'
              data-testid='btn-retry-quiz'
            >
              <RotateCcw className='w-4 h-4' />
              <span>{isRetrying ? 'Starting Attempt...' : 'Retry Quiz'}</span>
            </Button>
          )}
        </div>

        {/* Next Curriculum Item or Back to Course */}
        {nextItem ? (
          <Link href={getCurriculumItemHref(courseSlug, nextItem)} data-testid='btn-next-curriculum-item'>
            <Button className='rounded-xl text-xs font-bold px-5 py-2.5 bg-primary text-white hover:bg-primary/90 shadow-xs flex items-center gap-1.5'>
              <span>Continue to Next {nextItem.type === 'QUIZ' ? 'Quiz' : 'Lesson'}</span>
              <ArrowRight className='w-4 h-4' />
            </Button>
          </Link>
        ) : (
          <Link href='/my-courses'>
            <Button className='rounded-xl text-xs font-bold px-5 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center gap-1.5'>
              <Trophy className='w-4 h-4 text-amber-300' />
              <span>Return to My Courses</span>
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
