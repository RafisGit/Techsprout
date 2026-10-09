'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { approveCourseReview } from '@/lib/api/instructor';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Sparkles, AlertCircle } from 'lucide-react';

interface ReviewApprovalModalProps {
  courseId: string;
  courseTitle?: string;
  instructorName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ReviewApprovalModal({
  courseId,
  courseTitle,
  instructorName,
  open,
  onOpenChange,
  onSuccess,
}: ReviewApprovalModalProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: () => approveCourseReview(courseId),
    onSuccess: () => {
      setErrorMessage(null);
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
        'Failed to approve course review request.';
      setErrorMessage(msg);
    },
  });

  const handleApprove = () => {
    setErrorMessage(null);
    approveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <div className='w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2'>
            <Sparkles className='w-6 h-6' />
          </div>
          <DialogTitle className='text-lg font-bold text-gray-900'>
            Approve Course Publication
          </DialogTitle>
          <DialogDescription className='text-sm text-gray-600 mt-1'>
            You are about to approve <strong className='text-gray-900'>{courseTitle || 'this course'}</strong>
            {instructorName ? ` submitted by ${instructorName}` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 my-2'>
          <div className='p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-1.5'>
            <p className='font-semibold'>Institutional Publication Impact:</p>
            <ul className='list-disc list-inside space-y-1 text-emerald-800'>
              <li>The course will transition to <strong>PUBLISHED</strong> status.</li>
              <li>It will immediately be listed in the public catalog for student enrollment.</li>
              <li>A transactional notification will be dispatched alerting the instructor.</li>
              <li>The review request will be archived as <strong>APPROVED</strong>.</li>
            </ul>
          </div>

          {errorMessage && (
            <div className='p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2'>
              <AlertCircle className='w-4 h-4 flex-shrink-0 text-red-600' />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter className='gap-2 sm:gap-0 pt-2 border-t border-gray-100'>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={approveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type='button'
            onClick={handleApprove}
            disabled={approveMutation.isPending}
            className='bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2'
          >
            {approveMutation.isPending ? (
              <Loader2 className='w-4 h-4 animate-spin' />
            ) : (
              <CheckCircle2 className='w-4 h-4' />
            )}
            <span>Approve & Publish</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
