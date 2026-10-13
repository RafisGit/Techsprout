'use client';

import React from 'react';
import type { ProgressDistributionBucket, ProgressBracket } from '@techsprout/contracts';

interface ProgressDistributionBarProps {
  distribution: ProgressDistributionBucket[];
  totalLearners: number;
}

const BRACKET_CONFIG: Record<
  ProgressBracket,
  { label: string; description: string; barBg: string; textClass: string; dotClass: string }
> = {
  '0-19%': {
    label: '0–19%',
    description: 'Starting Out',
    barBg: 'bg-slate-400',
    textClass: 'text-slate-700',
    dotClass: 'bg-slate-400',
  },
  '20-39%': {
    label: '20–39%',
    description: 'Early Progress',
    barBg: 'bg-amber-400',
    textClass: 'text-amber-700',
    dotClass: 'bg-amber-400',
  },
  '40-59%': {
    label: '40–59%',
    description: 'Halfway Through',
    barBg: 'bg-blue-400',
    textClass: 'text-blue-700',
    dotClass: 'bg-blue-400',
  },
  '60-79%': {
    label: '60–79%',
    description: 'Upper Modules',
    barBg: 'bg-indigo-500',
    textClass: 'text-indigo-700',
    dotClass: 'bg-indigo-500',
  },
  '80-99%': {
    label: '80–99%',
    description: 'Near Complete',
    barBg: 'bg-purple-500',
    textClass: 'text-purple-700',
    dotClass: 'bg-purple-500',
  },
  '100%': {
    label: '100%',
    description: 'Course Completed',
    barBg: 'bg-emerald-500',
    textClass: 'text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
};

export function ProgressDistributionBar({
  distribution,
  totalLearners,
}: ProgressDistributionBarProps) {
  if (totalLearners === 0 || !distribution || distribution.length === 0) {
    return (
      <div
        role='region'
        aria-label='Learner Progress Distribution'
        className='bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500'
      >
        <p className='text-sm font-medium'>No learner progress recorded yet.</p>
        <p className='text-xs text-gray-400 mt-1'>
          Progress metrics will populate as enrolled students advance through lessons and quizzes.
        </p>
      </div>
    );
  }

  // Ensure buckets are in standard order
  const orderedBuckets: ProgressBracket[] = [
    '0-19%',
    '20-39%',
    '40-59%',
    '60-79%',
    '80-99%',
    '100%',
  ];

  const bucketMap = new Map(distribution.map((b) => [b.bracket, b]));

  return (
    <div
      role='region'
      aria-label='Learner Progress Distribution'
      className='bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-5'
    >
      <div>
        <div className='flex items-center justify-between'>
          <h3 className='text-base font-bold text-gray-900'>Learner Progress Distribution</h3>
          <span className='text-xs text-gray-500 font-medium'>
            {totalLearners} {totalLearners === 1 ? 'total learner' : 'total learners'}
          </span>
        </div>
        <p className='text-xs text-gray-500 mt-0.5'>
          Proportion of enrolled students across syllabus completion milestones.
        </p>
      </div>

      {/* Segmented Progress Bar */}
      <div
        className='h-5 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner'
        role='progressbar'
        aria-valuenow={100}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label='Progress bracket distribution'
      >
        {orderedBuckets.map((bracket) => {
          const item = bucketMap.get(bracket);
          const pct = item?.percentage || 0;
          if (pct <= 0) return null;
          const config = BRACKET_CONFIG[bracket];

          return (
            <div
              key={bracket}
              style={{ width: `${pct}%` }}
              className={`${config.barBg} transition-all duration-300 relative group`}
              title={`${config.label} (${config.description}): ${item?.studentCount} students (${pct}%)`}
            />
          );
        })}
      </div>

      {/* Legend & Bracket Metrics Grid */}
      <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2'>
        {orderedBuckets.map((bracket) => {
          const item = bucketMap.get(bracket);
          const studentCount = item?.studentCount || 0;
          const percentage = item?.percentage || 0;
          const config = BRACKET_CONFIG[bracket];

          return (
            <div
              key={bracket}
              className='p-3 rounded-xl border border-gray-100 bg-gray-50/50 flex flex-col justify-between'
            >
              <div className='flex items-center gap-1.5'>
                <span className={`w-2.5 h-2.5 rounded-full ${config.dotClass} flex-shrink-0`} />
                <span className='text-xs font-bold text-gray-800'>{config.label}</span>
              </div>
              <div className='mt-2'>
                <div className='text-lg font-extrabold text-gray-900'>{studentCount}</div>
                <div className='flex items-center justify-between text-[11px] text-gray-500 mt-0.5'>
                  <span>{percentage}%</span>
                  <span className='text-[10px] text-gray-400 truncate ml-1'>{config.description}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
