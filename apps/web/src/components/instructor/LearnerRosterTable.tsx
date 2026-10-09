'use client';

import React from 'react';
import type { CourseEnrollmentItem } from '@/lib/api/instructor';
import {
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Calendar,
  Mail,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LearnerRosterTableProps {
  items: CourseEnrollmentItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  searchQuery?: string;
  className?: string;
}

export function LearnerRosterTable({
  items,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  searchQuery,
  className = '',
}: LearnerRosterTableProps) {
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
        <h3 className='text-base font-bold text-gray-900'>Failed to load learner roster</h3>
        <p className='text-xs text-gray-500 max-w-md mx-auto mt-1'>
          {errorMessage || 'An error occurred while fetching the course enrollments. Please check your connection or permissions.'}
        </p>
        {onRetry && (
          <Button variant='outline' size='sm' onClick={onRetry} className='mt-4'>
            Retry Loading
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
          {searchQuery ? 'No matching learners found' : 'No students enrolled yet'}
        </h3>
        <p className='text-xs text-gray-500 max-w-sm mx-auto mt-1'>
          {searchQuery
            ? `No learners matched "${searchQuery}". Try searching with a different name or email.`
            : 'When students enroll in this published course, their learning progress and roster information will appear here.'}
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
            <span>Completed</span>
          </span>
        );
      case 'CANCELLED':
        return (
          <span className='inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200'>
            <XCircle className='w-3 h-3 text-gray-500' />
            <span>Cancelled</span>
          </span>
        );
      case 'ACTIVE':
      default:
        return (
          <span className='inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'>
            <Clock className='w-3 h-3 text-emerald-600' />
            <span>Active</span>
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

  return (
    <div className={className}>
      {/* Desktop Table View */}
      <div className='hidden md:block overflow-x-auto'>
        <table className='w-full text-left text-sm text-gray-600'>
          <thead className='bg-gray-50/80 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200'>
            <tr>
              <th scope='col' className='px-6 py-3.5'>Learner</th>
              <th scope='col' className='px-6 py-3.5'>Status</th>
              <th scope='col' className='px-6 py-3.5'>Course Progress</th>
              <th scope='col' className='px-6 py-3.5'>Enrolled Date</th>
              <th scope='col' className='px-6 py-3.5'>Completion Date</th>
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
                      <span className='text-gray-700'>{item.progressPercentage}%</span>
                      {item.progressPercentage === 100 && (
                        <span className='text-emerald-600 font-semibold text-[10px]'>Done</span>
                      )}
                    </div>
                    <div
                      className='w-full bg-gray-100 rounded-full h-2 overflow-hidden'
                      role='progressbar'
                      aria-valuenow={item.progressPercentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Course progress: ${item.progressPercentage}%`}
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
                  {new Date(item.enrolledAt).toLocaleDateString()}
                </td>

                {/* Completion Date */}
                <td className='px-6 py-4 whitespace-nowrap text-xs text-gray-500'>
                  {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '—'}
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
                <span className='text-gray-600 font-medium'>Progress</span>
                <span className='font-bold text-gray-900'>{item.progressPercentage}%</span>
              </div>
              <div
                className='w-full bg-gray-200 rounded-full h-1.5 overflow-hidden'
                role='progressbar'
                aria-valuenow={item.progressPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Course progress: ${item.progressPercentage}%`}
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
                Enrolled: {new Date(item.enrolledAt).toLocaleDateString()}
              </span>
              <span>
                {item.completedAt
                  ? `Completed: ${new Date(item.completedAt).toLocaleDateString()}`
                  : 'In progress'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
