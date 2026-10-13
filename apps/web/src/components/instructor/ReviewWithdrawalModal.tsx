'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { withdrawCourseReview } from '@/lib/api/instructor';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';

interface ReviewWithdrawalModalProps {
  courseId: string;
  courseTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function ReviewWithdrawalModal({
  courseId,
  courseTitle,
  open,
  onOpenChange,
  onSuccess,
}: ReviewWithdrawalModalProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const withdrawMutation = useMutation({
    mutationFn: () => withdrawCourseReview(courseId),
    onSuccess: () => {
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ['instructorCourses'] });
      queryClient.invalidateQueries({ queryKey: ['instructorCourse', courseId] });
      queryClient.invalidateQueries({ queryKey: ['instructorReviewStatus', courseId] });
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const errorObj = err as { response?: { data?: { message?: string } }; message?: string };
      const msg =
        errorObj.response?.data?.message ||
        errorObj.message ||
        'Failed to withdraw review request. The course state may have already changed.';
      setErrorMessage(msg);
    },
  });

  const handleWithdraw = () => {
    setErrorMessage(null);
    withdrawMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <div className='w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2'>
            <AlertTriangle className='w-6 h-6' />
          </div>
          <DialogTitle className='text-lg font-bold text-gray-900'>
            Withdraw Course Review Request
          </DialogTitle>
          <DialogDescription className='text-sm text-gray-600 mt-1'>
            Are you sure you want to withdraw the submission for{' '}
            <strong className='text-gray-900'>{courseTitle || 'this course'}</strong>?
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 my-2'>
          <div className='p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1.5'>
            <p className='font-semibold'>What happens when you withdraw?</p>
            <ul className='list-disc list-inside space-y-1 text-amber-800'>
              <li>The course will immediately return to <strong>DRAFT</strong> status.</li>
              <li>Curriculum editing will be fully unlocked so you can modify modules and lessons.</li>
              <li>The pending submission will be removed from the institutional review queue.</li>
              <li>You can resubmit whenever your revisions are ready.</li>
            </ul>
          </div>

          {errorMessage && (
            <div className='p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs'>
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter className='gap-2 sm:gap-0 pt-2 border-t border-gray-100'>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={withdrawMutation.isPending}
          >
            Keep in Review
          </Button>
          <Button
            type='button'
            variant='default'
            onClick={handleWithdraw}
            disabled={withdrawMutation.isPending}
            className='bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2'
          >
            {withdrawMutation.isPending ? (
              <Loader2 className='w-4 h-4 animate-spin' />
            ) : (
              <RotateCcw className='w-4 h-4' />
            )}
            <span>Confirm Withdrawal</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
