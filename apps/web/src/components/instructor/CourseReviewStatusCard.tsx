'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Send,
  RotateCcw,
  ExternalLink,
  MessageSquareQuote,
  Calendar,
  User,
} from 'lucide-react';
import type { ReviewRequestSummary } from '@/lib/api/instructor';

interface CourseReviewStatusCardProps {
  courseId: string;
  courseStatus: string;
  courseSlug?: string;
  reviewRequest?: ReviewRequestSummary | null;
  onSubmitForReview?: () => void;
  onWithdrawReview?: () => void;
  className?: string;
}

export function CourseReviewStatusCard({
  courseId,
  courseStatus,
  courseSlug,
  reviewRequest,
  onSubmitForReview,
  onWithdrawReview,
  className = '',
}: CourseReviewStatusCardProps) {
  // If the course is currently in review
  if (courseStatus === 'IN_REVIEW') {
    return (
      <div
        className={`p-5 rounded-2xl bg-blue-50/80 border border-blue-200 text-blue-900 ${className}`}
      >
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <div className='w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5'>
              <Clock className='w-5 h-5' />
            </div>
            <div>
              <div className='flex items-center gap-2'>
                <h4 className='font-bold text-base text-blue-950'>
                  Under Administrative Review
                </h4>
                <span className='px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300'>
                  Pending Decision
                </span>
              </div>
              <p className='text-xs text-blue-800 mt-1 max-w-xl'>
                Your course was submitted for institutional review and is awaiting evaluation by academic administrators. While under review, curriculum editing is temporarily locked to maintain integrity.
              </p>
              {reviewRequest?.submittedAt && (
                <div className='flex items-center gap-2 text-xs text-blue-700 mt-2 font-medium'>
                  <Calendar className='w-3.5 h-3.5' />
                  <span>
                    Submitted on: {new Date(reviewRequest.submittedAt).toLocaleDateString()} at{' '}
                    {new Date(reviewRequest.submittedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
              {reviewRequest?.submissionNotes && (
                <div className='mt-2.5 p-2.5 bg-white/70 rounded-lg border border-blue-200 text-xs text-blue-900'>
                  <span className='font-semibold'>Your submission notes: </span>
                  {reviewRequest.submissionNotes}
                </div>
              )}
            </div>
          </div>

          {onWithdrawReview && (
            <div className='flex-shrink-0 self-end sm:self-center'>
              <Button
                variant='outline'
                size='sm'
                onClick={onWithdrawReview}
                className='border-blue-300 text-blue-800 hover:bg-blue-100 flex items-center gap-1.5'
              >
                <RotateCcw className='w-4 h-4' />
                <span>Withdraw Review</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If the course was rejected and returned to draft with feedback
  if (reviewRequest?.status === 'REJECTED' && courseStatus === 'DRAFT') {
    return (
      <div
        className={`p-5 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-950 ${className}`}
      >
        <div className='flex flex-col sm:flex-row sm:items-start justify-between gap-4'>
          <div className='flex items-start gap-3'>
            <div className='w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 mt-0.5'>
              <AlertTriangle className='w-5 h-5' />
            </div>
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <h4 className='font-bold text-base text-amber-950'>
                  Revisions Requested by Administration
                </h4>
                <span className='px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300'>
                  Action Required
                </span>
              </div>
              <p className='text-xs text-amber-800 max-w-xl'>
                An administrator reviewed your course submission and requested revisions before it can be approved for publication.
              </p>

              {/* Administrative Feedback Quote */}
              {reviewRequest.adminFeedback && (
                <div className='p-3.5 bg-white rounded-xl border border-amber-300 shadow-2xs space-y-1.5'>
                  <div className='flex items-center gap-2 text-xs font-bold text-amber-900'>
                    <MessageSquareQuote className='w-4 h-4 text-amber-600' />
                    <span>Administrative Review Feedback:</span>
                  </div>
                  <p className='text-xs text-gray-800 leading-relaxed whitespace-pre-wrap pl-6'>
                    {reviewRequest.adminFeedback}
                  </p>
                  {reviewRequest.reviewedAt && (
                    <div className='text-[11px] text-gray-500 pl-6 pt-1 flex items-center gap-2'>
                      {reviewRequest.reviewer?.name && (
                        <span>Reviewed by: <strong>{reviewRequest.reviewer.name}</strong> &bull; </span>
                      )}
                      <span>{new Date(reviewRequest.reviewedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {onSubmitForReview && (
            <div className='flex-shrink-0 self-end sm:self-center'>
              <Button
                size='sm'
                onClick={onSubmitForReview}
                className='bg-primary text-white hover:bg-primary/90 flex items-center gap-1.5'
              >
                <Send className='w-4 h-4' />
                <span>Resubmit for Review</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If the course is published
  if (courseStatus === 'PUBLISHED') {
    return (
      <div
        className={`p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
      >
        <div className='flex items-center gap-3'>
          <div className='w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0'>
            <CheckCircle2 className='w-5 h-5' />
          </div>
          <div>
            <h4 className='font-bold text-sm text-emerald-950'>
              Published & Live in Public Catalog
            </h4>
            <p className='text-xs text-emerald-800 mt-0.5'>
              Students can view, enroll, and purchase this course.
            </p>
          </div>
        </div>

        {courseSlug && (
          <Link
            href={`/courses/${courseSlug}`}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline'
          >
            <span>View Public Listing</span>
            <ExternalLink className='w-3.5 h-3.5' />
          </Link>
        )}
      </div>
    );
  }

  return null;
}
