'use client';

import React from 'react';
import type { CourseEnrollmentItem } from '@/lib/api/instructor';
import { useTranslation } from '@/i18n';
import {
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  Mail,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export type RosterSortField = 'enrolledAt' | 'name' | 'progressPercentage' | 'lastAccessedAt';

interface LearnerRosterTableProps {
  items: CourseEnrollmentItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  searchQuery?: string;
  sortBy?: RosterSortField;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (field: RosterSortField) => void;
  className?: string;
}

export function LearnerRosterTable({
  items,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  searchQuery,
  sortBy,
  sortOrder,
  onSortChange,
  className = '',
}: LearnerRosterTableProps) {
  const { t, formatDate, formatNumber } = useTranslation();

  // Loading skeleton state
  if (isLoading) {
    return (
      <div className={`p-6 space-y-4 ${className}`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className='h-16 bg-gray-100 rounded-xl animate-pulse' />
        ))}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className={`py-12 px-6 text-center ${className}`}>
        <div className='w-12 h-12 rounded-2xl bg-red-50 text-red-600 mx-auto flex items-center justify-center mb-3'>
          <AlertCircle className='w-6 h-6' />
        </div>
        <h3 className='text-base font-bold text-gray-900'>{t('instructor.learners.table.failedToLoad')}</h3>
        <p className='text-xs text-gray-500 max-w-md mx-auto mt-1'>
          {errorMessage || t('instructor.learners.table.failedToLoadDesc')}
        </p>
        {onRetry && (
          <Button variant='outline' size='sm' onClick={onRetry} className='mt-4'>
            {t('instructor.learners.table.retry')}
          </Button>
        )}
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className={`py-16 px-6 text-center ${className}`}>
        <div className='w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mx-auto flex items-center justify-center mb-3'>
          {searchQuery ? <Search className='w-6 h-6' /> : <Users className='w-6 h-6' />}
        </div>
        <h3 className='text-base font-bold text-gray-900'>
          {searchQuery ? t('instructor.learners.table.noMatchTitle') : t('instructor.learners.table.emptyTitle')}
        </h3>
        <p className='text-xs text-gray-500 max-w-sm mx-auto mt-1'>
          {searchQuery
            ? t('instructor.learners.table.noMatchDesc', { query: searchQuery })
            : t('instructor.learners.table.emptyDesc')}
        </p>
      </div>
    );
  }

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className='inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200'>
            <CheckCircle2 className='w-3 h-3 text-blue-600' />
            <span>{t('instructor.learners.table.completed')}</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className='inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200'>
            <XCircle className='w-3 h-3 text-gray-500' />
            <span>{t('instructor.learners.table.cancelled')}</span>
          </span>
        );
      case 'ACTIVE':
      default:
        return (
          <span className='inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
            <Clock className='w-3 h-3 text-emerald-600' />
            <span>{t('instructor.learners.table.active')}</span>
          </span>
        );
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const renderSortIndicator = (field: RosterSortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown className='w-3 h-3 text-gray-400 group-hover:text-gray-600 transition-colors' />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className='w-3 h-3 text-primary' />
    ) : (
      <ArrowDown className='w-3 h-3 text-primary' />
    );
  };

  return (
    <div className={className}>
      {/* Desktop Table View */}
      <div className='hidden md:block overflow-x-auto'>
        <table className='w-full text-left text-sm text-gray-600'>
          <thead className='bg-gray-50/80 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200'>
            <tr>
              <th scope='col' className='px-6 py-3.5'>
                {onSortChange ? (
                  <button
                    type='button'
                    onClick={() => onSortChange('name')}
                    className='group flex items-center gap-1.5 hover:text-gray-900 font-semibold focus:outline-none'
                  >
                    <span>{t('instructor.learners.table.learner')}</span>
                    {renderSortIndicator('name')}
                  </button>
                ) : (
                  <span>{t('instructor.learners.table.learner')}</span>
                )}
              </th>
              <th scope='col' className='px-6 py-3.5'>{t('instructor.learners.table.status')}</th>
              <th scope='col' className='px-6 py-3.5'>
                {onSortChange ? (
                  <button
                    type='button'
                    onClick={() => onSortChange('progressPercentage')}
                    className='group flex items-center gap-1.5 hover:text-gray-900 font-semibold focus:outline-none'
                  >
                    <span>{t('instructor.learners.table.courseProgress')}</span>
                    {renderSortIndicator('progressPercentage')}
                  </button>
                ) : (
                  <span>{t('instructor.learners.table.courseProgress')}</span>
                )}
              </th>
              <th scope='col' className='px-6 py-3.5'>
                {onSortChange ? (
                  <button
                    type='button'
                    onClick={() => onSortChange('enrolledAt')}
                    className='group flex items-center gap-1.5 hover:text-gray-900 font-semibold focus:outline-none'
                  >
                    <span>{t('instructor.learners.table.enrolledDate')}</span>
                    {renderSortIndicator('enrolledAt')}
                  </button>
                ) : (
                  <span>{t('instructor.learners.table.enrolledDate')}</span>
                )}
              </th>
              <th scope='col' className='px-6 py-3.5'>{t('instructor.learners.table.completionDate')}</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-100'>
            {items.map((item) => (
              <tr key={item.enrollmentId} className='hover:bg-gray-50/60 transition-colors'>
                {/* Learner Info */}
                <td className='px-6 py-4'>
                  <div className='flex items-center gap-3'>
                    <div className='w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center flex-shrink-0'>
                      {getInitials(item.student.name || 'User')}
                    </div>
                    <div className='min-w-0'>
                      <div className='font-semibold text-gray-900 truncate'>{item.student.name}</div>
                      <div className='text-xs text-gray-500 truncate'>{item.student.email}</div>
                    </div>
                  </div>
                </td>

                {/* Enrollment Status */}
                <td className='px-6 py-4 whitespace-nowrap'>
                  {renderStatusBadge(item.status)}
                </td>

                {/* Progress Bar & Percentage */}
                <td className='px-6 py-4 whitespace-nowrap'>
                  <div className='w-36 space-y-1.5'>
                    <div className='flex items-center justify-between text-xs font-medium'>
                      <span className='text-gray-700'>{formatNumber(item.progressPercentage)}%</span>
                      {item.progressPercentage === 100 && (
                        <span className='text-emerald-600 font-semibold text-[10px]'>{t('instructor.learners.table.done')}</span>
                      )}
                    </div>
                    <div
                      className='w-full bg-gray-100 rounded-full h-2 overflow-hidden'
                      role='progressbar'
                      aria-valuenow={item.progressPercentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t('instructor.learners.table.progressLabel', { percent: formatNumber(item.progressPercentage) })}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.progressPercentage === 100
                            ? 'bg-emerald-500'
                            : item.progressPercentage > 50
                            ? 'bg-primary'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(item.progressPercentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </td>

                {/* Enrolled Date */}
                <td className='px-6 py-4 whitespace-nowrap text-xs text-gray-600'>
                  {formatDate(item.enrolledAt)}
                </td>

                {/* Completion Date */}
                <td className='px-6 py-4 whitespace-nowrap text-xs text-gray-500'>
                  {item.completedAt ? formatDate(item.completedAt) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className='md:hidden divide-y divide-gray-100'>
        {items.map((item) => (
          <div key={item.enrollmentId} className='p-4 space-y-3'>
            <div className='flex items-start justify-between gap-2'>
              <div className='flex items-center gap-2.5 min-w-0'>
                <div className='w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center flex-shrink-0'>
                  {getInitials(item.student.name || 'User')}
                </div>
                <div className='min-w-0'>
                  <div className='font-semibold text-gray-900 text-sm truncate'>{item.student.name}</div>
                  <div className='text-xs text-gray-500 truncate flex items-center gap-1'>
                    <Mail className='w-3 h-3 flex-shrink-0' />
                    <span>{item.student.email}</span>
                  </div>
                </div>
              </div>
              <div className='flex-shrink-0'>{renderStatusBadge(item.status)}</div>
            </div>

            {/* Mobile Progress Bar */}
            <div className='space-y-1 bg-gray-50 p-2.5 rounded-lg border border-gray-100'>
              <div className='flex items-center justify-between text-xs'>
                <span className='text-gray-600 font-medium'>{t('instructor.learners.table.progress')}</span>
                <span className='font-bold text-gray-900'>{formatNumber(item.progressPercentage)}%</span>
              </div>
              <div
                className='w-full bg-gray-200 rounded-full h-1.5 overflow-hidden'
                role='progressbar'
                aria-valuenow={item.progressPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('instructor.learners.table.progressLabel', { percent: formatNumber(item.progressPercentage) })}
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    item.progressPercentage === 100
                      ? 'bg-emerald-500'
                      : item.progressPercentage > 50
                      ? 'bg-primary'
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(item.progressPercentage, 100)}%` }}
                />
              </div>
            </div>

            {/* Mobile Dates */}
            <div className='flex items-center justify-between text-xs text-gray-500 pt-1'>
              <span className='flex items-center gap-1'>
                <Calendar className='w-3.5 h-3.5 text-gray-400' />
                {t('instructor.learners.table.enrolledOn', { date: formatDate(item.enrolledAt) })}
              </span>
              <span>
                {item.completedAt
                  ? t('instructor.learners.table.completedOn', { date: formatDate(item.completedAt) })
                  : t('instructor.learners.table.inProgress')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
