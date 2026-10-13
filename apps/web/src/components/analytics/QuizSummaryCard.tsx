'use client';

import React from 'react';
import type { QuizPerformanceSummaryDto } from '@techsprout/contracts';
import { HelpCircle, CheckCircle2, Award, Users } from 'lucide-react';

interface QuizSummaryCardProps {
  quizzes: QuizPerformanceSummaryDto[];
}

export function QuizSummaryCard({ quizzes }: QuizSummaryCardProps) {
  if (!quizzes || quizzes.length === 0) {
    return (
      <div
        role='region'
        aria-label='Quiz Performance Metrics'
        className='bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500'
      >
        <p className='text-sm font-medium'>No quizzes published in this course yet.</p>
        <p className='text-xs text-gray-400 mt-1'>
          Once quizzes or assessments are published, aggregate scores and pass rates will appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      role='region'
      aria-label='Quiz Assessment Performance'
      className='bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-5'
    >
      <div>
        <div className='flex items-center justify-between'>
          <h3 className='text-base font-bold text-gray-900'>Quiz & Assessment Performance</h3>
          <span className='text-xs text-gray-500 font-medium'>
            {quizzes.length} {quizzes.length === 1 ? 'quiz tracked' : 'quizzes tracked'}
          </span>
        </div>
        <p className='text-xs text-gray-500 mt-0.5'>
          Pass rates, average scores, and learner attempt frequencies across course assessments.
        </p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {quizzes.map((quiz) => {
          const passRateColor =
            quiz.passRate >= 70
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : quiz.passRate >= 50
              ? 'text-amber-700 bg-amber-50 border-amber-200'
              : 'text-rose-700 bg-rose-50 border-rose-200';

          return (
            <div
              key={quiz.quizId}
              className='p-5 rounded-2xl border border-gray-200 bg-white hover:border-gray-300 transition-colors shadow-2xs flex flex-col justify-between space-y-4'
            >
              <div>
                <div className='flex items-start justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <div className='w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0'>
                      <HelpCircle className='w-4 h-4' />
                    </div>
                    <h4 className='font-bold text-gray-900 text-sm line-clamp-1' title={quiz.quizTitle}>
                      {quiz.quizTitle}
                    </h4>
                  </div>
                </div>

                <div className='flex items-center gap-3 text-xs text-gray-500 mt-3'>
                  <div className='flex items-center gap-1'>
                    <Users className='w-3.5 h-3.5 text-gray-400' />
                    <span>{quiz.uniqueStudents} students</span>
                  </div>
                  <span>&bull;</span>
                  <div className='flex items-center gap-1'>
                    <span>{quiz.totalAttempts} attempts</span>
                  </div>
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3 pt-3 border-t border-gray-100'>
                <div>
                  <span className='text-[11px] font-medium text-gray-500'>Pass Rate</span>
                  <div className='flex items-center gap-1.5 mt-0.5'>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold border ${passRateColor}`}
                    >
                      {quiz.passRate}%
                    </span>
                  </div>
                </div>

                <div>
                  <span className='text-[11px] font-medium text-gray-500'>Average Score</span>
                  <div className='text-sm font-extrabold text-gray-900 mt-0.5'>
                    {quiz.averageScorePercentage}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
