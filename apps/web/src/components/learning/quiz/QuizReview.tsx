'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  Info,
  Award,
} from 'lucide-react';
import type { StudentQuizReviewDto } from '@techsprout/contracts';

interface QuizReviewProps {
  review: StudentQuizReviewDto;
  onBackToResults: () => void;
}

export function QuizReview({ review, onBackToResults }: QuizReviewProps) {
  const questions = review.questions || [];

  return (
    <div
      className='bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs'
      data-testid='quiz-review'
    >
      {/* Review Header Bar */}
      <div className='flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100'>
        <div className='space-y-1'>
          <div className='flex items-center gap-2'>
            <span className='text-xs font-bold text-gray-900'>
              Attempt #{review.attemptNumber} Review
            </span>
            <span className='text-gray-300'>•</span>
            <span
              className={`text-xs font-bold ${
                review.isPassed ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {review.isPassed ? 'Passed' : 'Failed'} ({review.percentage}%)
            </span>
          </div>
          <p className='text-xs text-gray-500'>
            Scored {review.score} of {review.totalPoints} points
          </p>
        </div>

        <Button
          type='button'
          variant='outline'
          onClick={onBackToResults}
          className='rounded-xl text-xs font-semibold px-4 py-2 border-gray-200 hover:bg-gray-50 flex items-center gap-1.5'
          data-testid='btn-back-to-results'
        >
          <ArrowLeft className='w-4 h-4' />
          <span>Back to Summary</span>
        </Button>
      </div>

      {/* Questions Review List */}
      <div className='space-y-8'>
        {questions.map((q, idx) => {
          const isAnswered = (q.selectedOptionIds || []).length > 0;
          const isCorrect = q.isCorrect;

          return (
            <div
              key={q.questionId}
              className='p-5 sm:p-6 rounded-2xl border border-gray-200/90 bg-gray-50/30 space-y-4'
              data-testid={`review-question-${q.questionId}`}
            >
              {/* Question Header & Points Status */}
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='flex items-center gap-2'>
                  <span className='text-xs font-bold text-gray-900'>
                    Question {idx + 1}
                  </span>

                  {/* Question Outcome Badge */}
                  {!isAnswered ? (
                    <span
                      className='inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200'
                      data-testid={`badge-unanswered-${q.questionId}`}
                    >
                      <AlertCircle className='w-3 h-3 text-amber-600' />
                      <span>Unanswered</span>
                    </span>
                  ) : isCorrect ? (
                    <span
                      className='inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200'
                      data-testid={`badge-correct-${q.questionId}`}
                    >
                      <CheckCircle2 className='w-3 h-3 text-emerald-600' />
                      <span>Correct</span>
                    </span>
                  ) : (
                    <span
                      className='inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-200'
                      data-testid={`badge-incorrect-${q.questionId}`}
                    >
                      <XCircle className='w-3 h-3 text-rose-600' />
                      <span>Incorrect</span>
                    </span>
                  )}
                </div>

                <div className='text-xs font-bold text-gray-700 flex items-center gap-1'>
                  <Award className='w-3.5 h-3.5 text-gray-400' />
                  <span>
                    {q.pointsAwarded} / {q.points} {q.points === 1 ? 'pt' : 'pts'}
                  </span>
                </div>
              </div>

              {/* Question Text */}
              <h3 className='text-sm sm:text-base font-bold text-gray-900 leading-snug'>
                {q.questionText}
              </h3>

              {/* Option Choices with Correctness Designations */}
              <div className='space-y-2 pt-1'>
                {q.options.map((opt) => {
                  const isSelected = q.selectedOptionIds.includes(opt.id);
                  const isOptCorrect = opt.isCorrect;

                  let cardStyle = 'border-gray-200 bg-white text-gray-700';
                  let icon = null;
                  let badge = null;

                  if (isSelected && isOptCorrect) {
                    cardStyle = 'border-emerald-300 bg-emerald-50/70 text-emerald-950 font-medium';
                    icon = <CheckCircle2 className='w-4 h-4 text-emerald-600 shrink-0 mt-0.5' />;
                    badge = (
                      <span className='text-[10px] font-bold text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded-full shrink-0'>
                        Your Answer (Correct)
                      </span>
                    );
                  } else if (isSelected && !isOptCorrect) {
                    cardStyle = 'border-rose-300 bg-rose-50/70 text-rose-950 font-medium';
                    icon = <XCircle className='w-4 h-4 text-rose-600 shrink-0 mt-0.5' />;
                    badge = (
                      <span className='text-[10px] font-bold text-rose-800 bg-rose-200/60 px-2 py-0.5 rounded-full shrink-0'>
                        Your Answer (Incorrect)
                      </span>
                    );
                  } else if (!isSelected && isOptCorrect) {
                    cardStyle = 'border-emerald-200 bg-emerald-50/30 text-emerald-950';
                    icon = <CheckCircle2 className='w-4 h-4 text-emerald-500 shrink-0 mt-0.5' />;
                    badge = (
                      <span className='text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full shrink-0'>
                        Correct Answer
                      </span>
                    );
                  }

                  return (
                    <div
                      key={opt.id}
                      data-testid={`review-opt-${opt.id}`}
                      className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs leading-relaxed transition ${cardStyle}`}
                    >
                      <div className='flex items-start gap-2.5 truncate pr-2'>
                        {icon}
                        <span className='truncate'>{opt.optionText}</span>
                      </div>
                      {badge}
                    </div>
                  );
                })}
              </div>

              {/* Server Explanation Callout (ONLY rendered when supplied by backend) */}
              {q.explanation && (
                <div
                  className='p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-blue-950 flex items-start gap-2.5'
                  data-testid={`explanation-${q.questionId}`}
                >
                  <Info className='w-4 h-4 text-blue-600 shrink-0 mt-0.5' />
                  <div className='space-y-0.5'>
                    <span className='font-bold text-blue-900'>Explanation: </span>
                    <span className='text-blue-800 leading-relaxed'>{q.explanation}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Back Button */}
      <div className='pt-4 border-t border-gray-100 flex justify-end'>
        <Button
          type='button'
          onClick={onBackToResults}
          className='rounded-xl text-xs font-semibold px-5 py-2.5 bg-primary text-white hover:bg-primary/90'
        >
          <ArrowLeft className='w-4 h-4 mr-1.5' />
          <span>Back to Results</span>
        </Button>
      </div>
    </div>
  );
}
