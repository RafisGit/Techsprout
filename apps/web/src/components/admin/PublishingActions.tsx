'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RotateCcw, Archive, AlertCircle, Loader2, Send, XCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CourseStatusBadge } from './StatusBadge';
import { publishCourse, unpublishCourse, archiveCourse } from '@/lib/api/catalog';
import { fetchCourseReviewStatus } from '@/lib/api/instructor';
import { CourseReviewStatusCard } from '@/components/instructor/CourseReviewStatusCard';
import { CourseReviewModal } from '@/components/instructor/CourseReviewModal';
import { ReviewWithdrawalModal } from '@/components/instructor/ReviewWithdrawalModal';
import { ReviewApprovalModal } from '@/components/admin/ReviewApprovalModal';
import { ReviewRejectionModal } from '@/components/admin/ReviewRejectionModal';
import type { CourseDto } from '@techsprout/contracts';

interface PublishingActionsProps {
  course: CourseDto;
  isAdmin: boolean;
  onStatusChanged?: (updatedCourse: CourseDto) => void;
}

export function PublishingActions({ course, isAdmin, onStatusChanged }: PublishingActionsProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Review interaction modals
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Query review state and history for this course
  const { data: reviewStatusData } = useQuery({
    queryKey: ['courseReviewStatus', course.id],
    queryFn: () => fetchCourseReviewStatus(course.id),
    staleTime: 30 * 1000,
  });

  const publishMutation = useMutation({
    mutationFn: () => publishCourse(course.id),
    onSuccess: (updated) => {
      clearMessages();
      setSuccessMessage('Course published successfully! It is now live in the public catalog.');
      queryClient.invalidateQueries({ queryKey: ['adminCourse', course.id] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      queryClient.invalidateQueries({ queryKey: ['courseReviewStatus', course.id] });
      onStatusChanged?.(updated);
    },
    onError: (err: unknown) => {
      const errorObj = err as { response?: { data?: { message?: string; errorCode?: string } }; message?: string };
      const msg = errorObj.response?.data?.message || errorObj.message || 'Failed to publish course';
      setErrorMessage(msg);
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: () => unpublishCourse(course.id),
    onSuccess: (updated) => {
      clearMessages();
      setSuccessMessage('Course unpublished. It is reverted to DRAFT and hidden from public catalog.');
      queryClient.invalidateQueries({ queryKey: ['adminCourse', course.id] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      queryClient.invalidateQueries({ queryKey: ['courseReviewStatus', course.id] });
      onStatusChanged?.(updated);
    },
    onError: (err: unknown) => {
      const errorObj = err as { response?: { data?: { message?: string } }; message?: string };
      const msg = errorObj.response?.data?.message || errorObj.message || 'Failed to unpublish course';
      setErrorMessage(msg);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveCourse(course.id),
    onSuccess: (updated) => {
      clearMessages();
      setSuccessMessage('Course archived. It is retired from the public catalog.');
      queryClient.invalidateQueries({ queryKey: ['adminCourse', course.id] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      queryClient.invalidateQueries({ queryKey: ['courseReviewStatus', course.id] });
      onStatusChanged?.(updated);
    },
    onError: (err: unknown) => {
      const errorObj = err as { response?: { data?: { message?: string } }; message?: string };
      const msg = errorObj.response?.data?.message || errorObj.message || 'Failed to archive course';
      setErrorMessage(msg);
    },
  });

  const isPending =
    publishMutation.isPending || unpublishMutation.isPending || archiveMutation.isPending;

  return (
    <div className='p-6 bg-white rounded-xl shadow-xs border border-gray-200 space-y-5'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100'>
        <div>
          <h3 className='text-lg font-bold text-gray-900'>Course Publishing & Governance</h3>
          <p className='text-xs text-gray-500 mt-0.5'>
            Formal state machine governing public visibility and lifecycle status.
          </p>
        </div>
        <div className='flex items-center space-x-3'>
          <Link href={`/instructor/courses/${course.id}/learners`}>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='text-xs flex items-center gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50'
            >
              <Users className='w-3.5 h-3.5' />
              <span>Learner Roster</span>
            </Button>
          </Link>
          <div className='flex items-center space-x-2'>
            <span className='text-xs text-gray-500 font-medium'>Current Status:</span>
            <CourseStatusBadge status={course.status} />
          </div>
        </div>
      </div>

      {/* Review Status Card Display (Banner, Rejection feedback, or Under Review state) */}
      <CourseReviewStatusCard
        courseId={course.id}
        courseStatus={course.status}
        courseSlug={course.slug}
        reviewRequest={reviewStatusData?.currentReview || reviewStatusData?.latestReviewRequest}
        onSubmitForReview={() => setIsSubmitModalOpen(true)}
        onWithdrawReview={!isAdmin ? () => setIsWithdrawModalOpen(true) : undefined}
      />

      {/* Success Notification */}
      {successMessage && (
        <div className='p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2'>
          <CheckCircle2 className='w-4 h-4 flex-shrink-0 text-emerald-600' />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className='p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start space-x-2.5'>
          <AlertCircle className='w-4 h-4 flex-shrink-0 text-red-600 mt-0.5' />
          <div>
            <p className='font-semibold'>Publishing Action Blocked</p>
            <p className='mt-0.5 text-red-700'>{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div>
        {isAdmin ? (
          <div className='flex flex-wrap items-center gap-3'>
            {course.status === 'IN_REVIEW' && (
              <>
                <Button
                  type='button'
                  onClick={() => setIsApproveModalOpen(true)}
                  className='bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center gap-1.5'
                >
                  <CheckCircle2 className='w-4 h-4' />
                  <span>Approve & Publish</span>
                </Button>

                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setIsRejectModalOpen(true)}
                  className='border-amber-300 text-amber-800 hover:bg-amber-50 text-sm font-medium flex items-center gap-1.5'
                >
                  <XCircle className='w-4 h-4' />
                  <span>Request Revisions</span>
                </Button>
              </>
            )}

            {course.status === 'DRAFT' && (
              <>
                <Button
                  type='button'
                  onClick={() => publishMutation.mutate()}
                  disabled={isPending}
                  className='bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm'
                >
                  {publishMutation.isPending ? (
                    <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  ) : (
                    <CheckCircle2 className='w-4 h-4 mr-2' />
                  )}
                  Publish Course (Direct)
                </Button>

                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setIsSubmitModalOpen(true)}
                  disabled={isPending}
                  className='text-primary border-primary/30 hover:bg-primary/5 text-sm font-medium flex items-center gap-1.5'
                >
                  <Send className='w-4 h-4' />
                  <span>Submit for Review</span>
                </Button>
              </>
            )}

            {course.status === 'PUBLISHED' && (
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => unpublishMutation.mutate()}
                  disabled={isPending}
                  className='border-amber-300 text-amber-800 hover:bg-amber-50 text-sm font-medium'
                >
                  {unpublishMutation.isPending ? (
                    <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  ) : (
                    <RotateCcw className='w-4 h-4 mr-2' />
                  )}
                  Unpublish to Draft
                </Button>

                <Button
                  type='button'
                  variant='outline'
                  onClick={() => archiveMutation.mutate()}
                  disabled={isPending}
                  className='border-slate-400 text-slate-700 hover:bg-slate-100 text-sm font-medium'
                >
                  {archiveMutation.isPending ? (
                    <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  ) : (
                    <Archive className='w-4 h-4 mr-2' />
                  )}
                  Archive Course
                </Button>
              </>
            )}

            {course.status === 'ARCHIVED' && (
              <p className='text-xs text-slate-500 italic'>
                This course is archived. Deletion and edits are restricted to preserve academic records.
              </p>
            )}
          </div>
        ) : (
          <div className='space-y-3'>
            {course.status === 'DRAFT' &&
              (reviewStatusData?.currentReview || reviewStatusData?.latestReviewRequest)?.status !== 'REJECTED' && (
              <div>
                <Button
                  type='button'
                  onClick={() => setIsSubmitModalOpen(true)}
                  className='bg-primary text-white font-medium text-sm hover:bg-primary/90 flex items-center gap-1.5'
                >
                  <Send className='w-4 h-4' />
                  <span>Submit for Institutional Review</span>
                </Button>
              </div>
            )}

            <div className='p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600'>
              <strong>Instructor Notice:</strong> Publishing, unpublishing, and archiving are restricted to institutional administrators. When your curriculum is finalized, submit your course for review.
            </div>
          </div>
        )}
      </div>

      {/* Review Modals */}
      <CourseReviewModal
        courseId={course.id}
        courseTitle={course.title}
        open={isSubmitModalOpen}
        onOpenChange={setIsSubmitModalOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['adminCourse', course.id] });
          queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
          queryClient.invalidateQueries({ queryKey: ['courseReviewStatus', course.id] });
          queryClient.invalidateQueries({ queryKey: ['instructorCourses'] });
          onStatusChanged?.({ ...course, status: 'IN_REVIEW' });
        }}
      />

      <ReviewWithdrawalModal
        courseId={course.id}
        courseTitle={course.title}
        open={isWithdrawModalOpen}
        onOpenChange={setIsWithdrawModalOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['adminCourse', course.id] });
          queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
          queryClient.invalidateQueries({ queryKey: ['courseReviewStatus', course.id] });
          queryClient.invalidateQueries({ queryKey: ['instructorCourses'] });
          onStatusChanged?.({ ...course, status: 'DRAFT' });
        }}
      />

      {isAdmin && (
        <>
          <ReviewApprovalModal
            courseId={course.id}
            courseTitle={course.title}
            open={isApproveModalOpen}
            onOpenChange={setIsApproveModalOpen}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['adminCourse', course.id] });
              queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
              queryClient.invalidateQueries({ queryKey: ['courseReviewStatus', course.id] });
              queryClient.invalidateQueries({ queryKey: ['adminReviewQueue'] });
              onStatusChanged?.({ ...course, status: 'PUBLISHED' });
            }}
          />

          <ReviewRejectionModal
            courseId={course.id}
            courseTitle={course.title}
            open={isRejectModalOpen}
            onOpenChange={setIsRejectModalOpen}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['adminCourse', course.id] });
              queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
              queryClient.invalidateQueries({ queryKey: ['courseReviewStatus', course.id] });
              queryClient.invalidateQueries({ queryKey: ['adminReviewQueue'] });
              onStatusChanged?.({ ...course, status: 'DRAFT' });
            }}
          />
        </>
      )}
    </div>
  );
}
