import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { CourseStatus, CourseVisibility } from '@techsprout/contracts';

interface StatusBadgeProps {
  status: CourseStatus;
}

export function CourseStatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case 'PUBLISHED':
      return (
        <span className='inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800'>
          <span className='mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500' />
          Published
        </span>
      );
    case 'ARCHIVED':
      return (
        <span className='inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800'>
          <span className='mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-500' />
          Archived
        </span>
      );
    case 'IN_REVIEW':
      return (
        <span className='inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800'>
          <span className='mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500' />
          In Review
        </span>
      );
    case 'DRAFT':
    default:
      return (
        <span className='inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700'>
          <span className='mr-1.5 h-1.5 w-1.5 rounded-full bg-slate-400' />
          Draft
        </span>
      );
  }
}

interface VisibilityBadgeProps {
  visibility: CourseVisibility;
}

export function VisibilityBadge({ visibility }: VisibilityBadgeProps) {
  if (visibility === 'PUBLIC') {
    return (
      <Badge
        variant='outline'
        className='border-blue-200 bg-blue-50 text-xs font-normal text-blue-700'
      >
        Public
      </Badge>
    );
  }
  return (
    <Badge
      variant='outline'
      className='border-slate-300 bg-slate-50 text-xs font-normal text-slate-600'
    >
      Private
    </Badge>
  );
}
