'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { rejectCourseReview } from '@/lib/api/instructor';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Loader2, MessageSquareX, RotateCcw } from 'lucide-react';

interface ReviewRejectionModalProps {
  courseId: string;
  courseTitle?: string;
  instructorName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ReviewRejectionModal({
  courseId,
  courseTitle,
  instructorName,
  open,
  onOpenChange,
  onSuccess,
}: ReviewRejectionModalProps) {
  const queryClient = useQueryClient();
  const [adminFeedback, setAdminFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedFeedback = adminFeedback.trim();
  const isValidLength = trimmedFeedback.length >= 5 && trimmedFeedback.length <= 2000;

  const rejectMutation = useMutation({
    mutationFn: () => rejectCourseReview(courseId, { adminFeedback: trimmedFeedback }),
    onSuccess: () => {
      setErrorMessage(null);
      setAdminFeedback('');
      queryClient.invalidateQueries({ queryKey: ['adminReviewQueue'] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const errorObj = err as { response?: { data?: { message?: string } }; message?: string };
      const msg =
        errorObj.response?.data?.message ||
        errorObj.message ||
        'Failed to reject course review. Please verify your feedback meets the 5-character minimum.';
      setErrorMessage(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidLength || rejectMutation.isPending) return;
    setErrorMessage(null);
    rejectMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <div className='w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2'>
            <MessageSquareX className='w-6 h-6' />
          </div>
          <DialogTitle className='text-lg font-bold text-gray-900'>
            Request Revisions & Reject Submission
          </DialogTitle>
          <DialogDescription className='text-sm text-gray-600 mt-1'>
            Provide clear, actionable feedback for{' '}
            <strong className='text-gray-900'>{courseTitle || 'this course'}</strong>
            {instructorName ? ` (Instructor: ${instructorName})` : ''}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className='space-y-4 my-2'>
          <div className='p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1'>
            <p className='font-semibold'>Institutional Rejection Policy:</p>
            <p className='text-amber-800 leading-relaxed'>
              This action transitions the course status back to <strong>DRAFT</strong> and unlocks curriculum editing for the instructor. Your feedback will be displayed prominently on the instructor's dashboard to guide their revisions.
            </p>
          </div>

          {errorMessage && (
            <div className='p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2'>
              <AlertCircle className='w-4 h-4 flex-shrink-0 text-red-600' />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className='space-y-1.5'>
            <label htmlFor='adminFeedback' className='block text-xs font-bold text-gray-700'>
              Administrative Feedback <span className='text-red-500'>*</span>
            </label>
            <Textarea
              id='adminFeedback'
              value={adminFeedback}
              onChange={(e) => setAdminFeedback(e.target.value.slice(0, 2000))}
              placeholder='Specify required adjustments (e.g. "Please add video resources to Module 1 and provide a more comprehensive course description before publication."). Minimum 5 characters.'
              rows={4}
              required
              className='text-sm'
            />
            <div className='flex items-center justify-between text-[11px] text-gray-500'>
              <span>
                {trimmedFeedback.length < 5 ? (
                  <span className='text-amber-600 font-medium'>
                    Minimum 5 characters required ({trimmedFeedback.length}/5)
                  </span>
                ) : (
                  <span className='text-emerald-600 font-medium'>Validation passed</span>
                )}
              </span>
              <span>{adminFeedback.length} / 2000</span>
            </div>
          </div>

          <DialogFooter className='gap-2 sm:gap-0 pt-2 border-t border-gray-100'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type='submit'
              disabled={!isValidLength || rejectMutation.isPending}
              className='bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2'
            >
              {rejectMutation.isPending ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                <RotateCcw className='w-4 h-4' />
              )}
              <span>Submit Rejection & Feedback</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
