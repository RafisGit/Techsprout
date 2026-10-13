'use client';

import React from 'react';
import type { LessonDropOffItemDto } from '@techsprout/contracts';
import { ArrowDownRight, Video, FileText, HelpCircle, Layers } from 'lucide-react';

interface DropOffTableProps {
  items: LessonDropOffItemDto[];
  totalEnrolled: number;
}

export function DropOffTable({ items, totalEnrolled }: DropOffTableProps) {
  if (!items || items.length === 0) {
    return (
      <div
        role='region'
        aria-label='Curriculum Drop-Off Analysis'
        className='bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500'
      >
        <p className='text-sm font-medium'>No curriculum lessons available for drop-off analysis.</p>
        <p className='text-xs text-gray-400 mt-1'>
          Publish modules and lessons to begin monitoring learner progression and drop-off points.
        </p>
      </div>
    );
  }

  const getLessonIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'VIDEO':
        return <Video className='w-3.5 h-3.5 text-blue-600' />;
      case 'TEXT':
        return <FileText className='w-3.5 h-3.5 text-emerald-600' />;
      case 'QUIZ':
        return <HelpCircle className='w-3.5 h-3.5 text-purple-600' />;
      default:
        return <Layers className='w-3.5 h-3.5 text-gray-600' />;
    }
  };

  return (
    <div
      role='region'
      aria-label='Lesson Completion & Drop-Off Analysis'
      className='bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden space-y-0'
    >
      <div className='p-6 border-b border-gray-100'>
        <div className='flex items-center justify-between'>
          <h3 className='text-base font-bold text-gray-900'>
            Sequential Lesson Completion & Drop-Off
          </h3>
          <span className='text-xs text-gray-500 font-medium'>
            {items.length} {items.length === 1 ? 'lesson analyzed' : 'lessons analyzed'}
          </span>
        </div>
        <p className='text-xs text-gray-500 mt-0.5'>
          Track learner progression lesson-by-lesson to pinpoint where students pause or disengage.
        </p>
      </div>

      <div className='overflow-x-auto'>
        <table className='min-w-full divide-y divide-gray-200 text-xs text-left'>
          <thead className='bg-gray-50/75 text-gray-700 font-semibold'>
            <tr>
              <th scope='col' className='px-4 py-3 w-16 text-center'>
                #
              </th>
              <th scope='col' className='px-4 py-3'>
                Curriculum Item
              </th>
              <th scope='col' className='px-4 py-3 text-center'>
                Completed
              </th>
              <th scope='col' className='px-4 py-3 min-w-[160px]'>
                Completion Rate
              </th>
              <th scope='col' className='px-4 py-3 text-right'>
                Drop-Off from Prior
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-100 bg-white'>
            {items.map((item, idx) => {
              const isFirst = idx === 0;
              const hasDropOff = item.dropOffRateFromPrior > 0;

              return (
                <tr key={item.lessonId} className='hover:bg-gray-50/75 transition-colors'>
                  {/* Position */}
                  <td className='px-4 py-3 text-center font-mono text-gray-400 font-medium'>
                    {idx + 1}
                  </td>

                  {/* Title & Module */}
                  <td className='px-4 py-3'>
                    <div className='flex items-center gap-2'>
                      <div className='p-1 rounded-md bg-gray-100 flex-shrink-0'>
                        {getLessonIcon(item.lessonType)}
                      </div>
                      <div className='min-w-0'>
                        <div className='font-semibold text-gray-900 truncate max-w-sm'>
                          {item.lessonTitle}
                        </div>
                        <div className='text-[11px] text-gray-500 truncate'>
                          {item.moduleTitle} &bull;{' '}
                          <span className='uppercase font-mono text-[10px]'>{item.lessonType}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Completed Learners Count */}
                  <td className='px-4 py-3 text-center'>
                    <span className='font-semibold text-gray-900'>
                      {item.completedLearnersCount}
                    </span>
                    <span className='text-gray-400 text-[10px] ml-1'>/ {totalEnrolled}</span>
                  </td>

                  {/* Completion Rate with visual bar */}
                  <td className='px-4 py-3'>
                    <div className='space-y-1'>
                      <div className='flex items-center justify-between text-xs font-semibold text-gray-700'>
                        <span>{item.completionRate}%</span>
                      </div>
                      <div className='w-full bg-gray-100 h-2 rounded-full overflow-hidden'>
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            item.completionRate >= 70
                              ? 'bg-emerald-500'
                              : item.completionRate >= 40
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(item.completionRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Drop-Off Rate */}
                  <td className='px-4 py-3 text-right font-medium'>
                    {isFirst ? (
                      <span className='text-gray-400 text-[11px] font-mono'>Baseline (0%)</span>
                    ) : hasDropOff ? (
                      <span className='inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200'>
                        <ArrowDownRight className='w-3 h-3 text-rose-600' />
                        <span>-{item.dropOffRateFromPrior}%</span>
                      </span>
                    ) : item.dropOffRateFromPrior < 0 ? (
                      <span className='inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                        <span>+{Math.abs(item.dropOffRateFromPrior)}%</span>
                      </span>
                    ) : (
                      <span className='text-gray-400 text-xs font-mono'>0.0%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
