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
        <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200'>
          <span className='w-1.5 h-1.5 mr-1.5 rounded-full bg-emerald-500 animate-pulse' />
          Published
        </span>
      );
    case 'ARCHIVED':
      return (
        <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200'>
          <span className='w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-500' />
          Archived
        </span>
      );
    case 'DRAFT':
    default:
      return (
        <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200'>
          <span className='w-1.5 h-1.5 mr-1.5 rounded-full bg-slate-400' />
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
      <Badge variant='outline' className='text-xs font-normal border-blue-200 text-blue-700 bg-blue-50'>
        Public
      </Badge>
    );
  }
  return (
    <Badge variant='outline' className='text-xs font-normal border-slate-300 text-slate-600 bg-slate-50'>
      Private
    </Badge>
  );
}
