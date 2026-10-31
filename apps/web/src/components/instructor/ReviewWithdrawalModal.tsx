'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { withdrawCourseReview } from '@/lib/api/instructor';
import { useTranslation } from '@/i18n';
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
  const { t } = useTranslation();
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
        t('instructor.review.failedToWithdraw');
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
            {t('instructor.review.withdrawalTitle')}
          </DialogTitle>
          <DialogDescription className='text-sm text-gray-600 mt-1'>
            {t('instructor.review.withdrawalDesc', { title: courseTitle || 'this course' })}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 my-2'>
          <div className='p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1.5'>
            <p className='font-semibold'>{t('instructor.review.withdrawalWhatHappens')}</p>
            <ul className='list-disc list-inside space-y-1 text-amber-800'>
              <li>{t('instructor.review.withdrawalPoints.returnToDraft')}</li>
              <li>{t('instructor.review.withdrawalPoints.unlocked')}</li>
              <li>{t('instructor.review.withdrawalPoints.removedFromQueue')}</li>
              <li>{t('instructor.review.withdrawalPoints.resubmitReady')}</li>
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
            {t('instructor.review.keepInReview')}
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
            <span>{withdrawMutation.isPending ? t('instructor.review.withdrawing') : t('instructor.review.confirmWithdrawal')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
