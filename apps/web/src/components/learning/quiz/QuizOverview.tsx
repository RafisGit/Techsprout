'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Award,
  CheckCircle2,
  Clock,
  FileQuestion,
  HelpCircle,
  PlayCircle,
  RotateCcw,
  AlertCircle,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import type { StudentQuizDto, StudentActiveAttemptDto } from '@techsprout/contracts';
import { useTranslation } from '@/i18n';

interface QuizOverviewProps {
  quiz: StudentQuizDto;
  activeAttempt?: StudentActiveAttemptDto | null;
  isStartingAttempt?: boolean;
  onStartAttempt: () => void;
  onResumeAttempt?: () => void;
  onViewReview?: () => void;
  isEnrollmentCompleted?: boolean;
}

export function QuizOverview({
  quiz,
  activeAttempt,
  isStartingAttempt = false,
  onStartAttempt,
  onResumeAttempt,
  onViewReview,
  isEnrollmentCompleted = false,
}: QuizOverviewProps) {
  const { t, formatNumber } = useTranslation();
  const isFinalExam = quiz.quizType === 'FINAL_EXAM';
  const isUnlimitedAttempts = quiz.maxAttempts === null || quiz.maxAttempts === undefined;
  const attemptsUsed = quiz.userAttemptsCount || 0;
  const maxAttempts = quiz.maxAttempts;
  const attemptsRemaining = isUnlimitedAttempts ? null : Math.max(0, (maxAttempts || 0) - attemptsUsed);
  const isExhausted = !isUnlimitedAttempts && attemptsRemaining !== null && attemptsRemaining <= 0;
  const isPassed = quiz.isPassed;
  const hasActiveAttempt = !!activeAttempt && activeAttempt.status === 'IN_PROGRESS';

  return (
    <div
      className='bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs'
      data-testid='quiz-overview'
    >
      {/* Header & Badges */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 ${
              isFinalExam
                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                : 'bg-indigo-50 text-indigo-800 border border-indigo-100'
            }`}
          >
            {isFinalExam ? (
              <>
                <Award className='w-3.5 h-3.5 text-amber-600' />
                <span>{t('quiz.finalExam')}</span>
              </>
            ) : (
              <>
                <HelpCircle className='w-3.5 h-3.5 text-indigo-600' />
                <span>{t('quiz.knowledgeCheck')}</span>
              </>
            )}
          </span>

          {isPassed && (
            <span
              className='text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5'
              data-testid='badge-passed'
            >
              <CheckCircle2 className='w-3.5 h-3.5 text-emerald-600' />
              <span>{t('quiz.passed')}</span>
            </span>
          )}
        </div>

        {quiz.bestScorePercentage !== null && (
          <div className='text-xs font-semibold text-gray-500'>
            {t('quiz.bestScore')}{' '}
            <span className='font-bold text-gray-900' data-testid='best-score'>
              {quiz.bestScorePercentage}%
            </span>
          </div>
        )}
      </div>

      {/* Title & Description */}
      <div className='space-y-2'>
        <h1 className='text-xl sm:text-2xl font-bold text-gray-900 leading-tight' data-testid='quiz-title'>
          {quiz.title}
        </h1>
        {quiz.description && (
          <p className='text-xs sm:text-sm text-gray-600 leading-relaxed max-w-2xl'>
            {quiz.description}
          </p>
        )}
      </div>

      {/* Passed Status Banner */}
      {isPassed && (
        <div className='bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3'>
          <CheckCircle2 className='w-5 h-5 text-emerald-600 shrink-0 mt-0.5' />
          <div className='text-xs text-emerald-900 space-y-0.5'>
            <p className='font-bold'>{t('quiz.assessmentRequirementSatisfied')}</p>
            <p className='text-emerald-700'>{t('quiz.assessmentPassedDesc')}</p>



          </div>
        </div>
      )}

      {/* Metadata Metrics Grid */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 py-2'>
        {/* Questions Count */}
        <div className='p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-1'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center gap-1.5'>
            <FileQuestion className='w-3.5 h-3.5 text-gray-400' />
            Questions
          </span>
          <span className='text-sm sm:text-base font-bold text-gray-900' data-testid='stat-questions-count'>
            {quiz.questionsCount}
          </span>
        </div>

        {/* Total Points */}
        <div className='p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-1'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center gap-1.5'>
            <Award className='w-3.5 h-3.5 text-gray-400' />
            {t('quiz.totalPoints')}
          </span>
          <span className='text-sm sm:text-base font-bold text-gray-900' data-testid='stat-total-points'>
            {formatNumber(quiz.totalPoints)} {t('quiz.pts')}
          </span>
        </div>

        {/* Passing Score */}
        <div className='p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-1'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center gap-1.5'>
            <ShieldCheck className='w-3.5 h-3.5 text-gray-400' />
            {t('quiz.passingScore')}
          </span>
          <span className='text-sm sm:text-base font-bold text-gray-900' data-testid='stat-passing-score'>
            {quiz.passingScorePercentage}%
          </span>
        </div>

        {/* Time Limit */}
        <div className='p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex flex-col gap-1'>
          <span className='text-[11px] font-medium text-gray-500 flex items-center gap-1.5'>
            <Clock className='w-3.5 h-3.5 text-gray-400' />
            {t('quiz.timeLimit')}
          </span>
          <span className='text-sm sm:text-base font-bold text-gray-900' data-testid='stat-time-limit'>
            {quiz.timeLimitMinutes ? t('catalog.mins', { count: formatNumber(quiz.timeLimitMinutes) }) : t('quiz.untimed')}
          </span>
        </div>
      </div>

      {/* Attempts Configuration & Status */}
      <div className='p-4 rounded-2xl bg-gray-50/70 border border-gray-100 flex items-center justify-between text-xs text-gray-600'>
        <span>{t('quiz.attemptsUsed')}</span>
        <span className='font-bold text-gray-900' data-testid='attempts-status'>
          {isUnlimitedAttempts ? (
            <span>{t('quiz.unlimitedAllowed', { count: formatNumber(attemptsUsed) })}</span>
          ) : (
            <span>
              {t('quiz.attemptsCountUsed', {
                used: formatNumber(attemptsUsed),
                max: formatNumber(maxAttempts || 0),
                remaining: formatNumber(attemptsRemaining || 0),
              })}
            </span>
          )}
        </span>
      </div>

      {/* Status Notices */}
      {isEnrollmentCompleted && (
        <div className='bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3'>
          <AlertCircle className='w-5 h-5 text-amber-600 shrink-0 mt-0.5' />
          <div className='text-xs text-amber-900 space-y-1'>
            <p className='font-bold'>{t('myCourses.completed')}</p>
            <p className='text-amber-800'>{t('quiz.courseCompletedNotice')}</p>




          </div>
        </div>
      )}

      {isExhausted && !isEnrollmentCompleted && (
        <div className='bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3' data-testid='notice-exhausted'>
          <AlertCircle className='w-5 h-5 text-rose-600 shrink-0 mt-0.5' />
          <div className='text-xs text-rose-900 space-y-1'>
            <p className='font-bold'>{t('quiz.attemptLimitReached')}</p>
            <p className='text-rose-700'>{t('quiz.attemptLimitReachedDesc', { max: formatNumber(maxAttempts || 0) })}</p>



          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className='flex flex-wrap items-center gap-3 pt-2'>
        {hasActiveAttempt ? (
          <Button
            onClick={onResumeAttempt || onStartAttempt}
            disabled={isStartingAttempt}
            className='rounded-xl text-xs font-bold px-6 py-2.5 bg-primary text-white hover:bg-primary/90 shadow-xs flex items-center gap-2'
            data-testid='btn-resume-attempt'
          >
            <PlayCircle className='w-4 h-4' />
            <span>
              {t('quiz.resumeAttemptNumber', {
                number: formatNumber(activeAttempt.attemptNumber),
              })}
            </span>
          </Button>
        ) : isEnrollmentCompleted || isExhausted ? (
          onViewReview && (
            <Button
              onClick={onViewReview}
              variant='outline'
              className='rounded-xl text-xs font-semibold px-5 py-2.5 border-gray-300 hover:bg-gray-50 flex items-center gap-2'
              data-testid='btn-review-answers'
            >
              <Eye className='w-4 h-4 text-gray-500' />
              <span>{t('quiz.reviewPreviousAttempt')}</span>
            </Button>
          )
        ) : (
          <Button
            onClick={onStartAttempt}
            disabled={isStartingAttempt}
            className='rounded-xl text-xs font-bold px-6 py-2.5 bg-primary text-white hover:bg-primary/90 shadow-xs flex items-center gap-2'
            data-testid='btn-start-quiz'
          >
            {attemptsUsed > 0 ? (
              <>
                <RotateCcw className='w-4 h-4' />
                <span>{isStartingAttempt ? t('quiz.starting') : t('quiz.retakeQuiz')}</span>
              </>
            ) : (
              <>
                <PlayCircle className='w-4 h-4' />
                <span>{isStartingAttempt ? t('quiz.starting') : t('quiz.startQuiz')}</span>
              </>
            )}
          </Button>
        )}

        {/* Option to Review if learner previously attempted and not currently exhausted */}
        {!hasActiveAttempt && attemptsUsed > 0 && !isExhausted && !isEnrollmentCompleted && onViewReview && (
          <Button
            onClick={onViewReview}
            variant='outline'
            className='rounded-xl text-xs font-semibold px-4 py-2.5 border-gray-200 hover:bg-gray-50 text-gray-700 flex items-center gap-1.5'
            data-testid='btn-review-previous'
          >
            <Eye className='w-4 h-4 text-gray-400' />
            <span>{t('quiz.reviewLastAttempt')}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
