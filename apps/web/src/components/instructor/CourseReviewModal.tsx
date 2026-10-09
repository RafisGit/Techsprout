'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchInstructorCourseById,
  submitCourseForReview,
} from '@/lib/api/instructor';
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
import { CheckCircle2, AlertCircle, Loader2, Send, HelpCircle } from 'lucide-react';

interface CourseReviewModalProps {
  courseId: string;
  courseTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CourseReviewModal({
  courseId,
  courseTitle,
  open,
  onOpenChange,
  onSuccess,
}: CourseReviewModalProps) {
  const queryClient = useQueryClient();
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch full course details including modules and lessons to verify checklist
  const {
    data: course,
    isLoading: isLoadingCourse,
    isError: isCourseError,
  } = useQuery({
    queryKey: ['instructorCourse', courseId],
    queryFn: () => fetchInstructorCourseById(courseId),
    enabled: open && !!courseId,
  });

  // Preflight validation checks
  const hasTitle = Boolean(course?.title && course.title.trim().length > 0);
  const hasDescription = Boolean(course?.description && course.description.trim().length > 0);
  const hasThumbnail = Boolean(course?.thumbnailMediaId || course?.thumbnailUrl);
  const moduleCount = course?.modules?.length || 0;
  const hasModules = moduleCount > 0;
  const lessonCount =
    course?.modules?.reduce((acc, m) => acc + (m.lessons?.length || 0), 0) || 0;
  const hasLessons = lessonCount > 0;

  const isEligible = hasTitle && hasDescription && hasThumbnail && hasModules && hasLessons;

  // Submit Mutation
  const submitMutation = useMutation({
    mutationFn: () =>
      submitCourseForReview(courseId, {
        submissionNotes: submissionNotes.trim() || undefined,
      }),
    onSuccess: () => {
      setErrorMessage(null);
      setSubmissionNotes('');
      queryClient.invalidateQueries({ queryKey: ['instructorCourses'] });
      queryClient.invalidateQueries({ queryKey: ['instructorCourse', courseId] });
      queryClient.invalidateQueries({ queryKey: ['instructorReviewStatus', courseId] });
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const errorObj = err as {
        response?: { data?: { message?: string; details?: { missingRequirements?: string[] } } };
        message?: string;
      };
      const msg =
        errorObj.response?.data?.details?.missingRequirements?.join(', ') ||
        errorObj.response?.data?.message ||
        errorObj.message ||
        'Failed to submit course for review. Please check all requirements.';
      setErrorMessage(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEligible || submitMutation.isPending) return;
    setErrorMessage(null);
    submitMutation.mutate();
  };

  const checklistItems = [
    {
      id: 'title',
      label: 'Course Title',
      description: course?.title ? `"${course.title}"` : 'Missing title',
      passed: hasTitle,
    },
    {
      id: 'description',
      label: 'Course Description',
      description: hasDescription ? 'Detailed syllabus description provided' : 'Missing description',
      passed: hasDescription,
    },
    {
      id: 'thumbnail',
      label: 'Thumbnail Media',
      description: hasThumbnail ? 'Course cover image attached' : 'Thumbnail image required',
      passed: hasThumbnail,
    },
    {
      id: 'modules',
      label: 'Curriculum Modules',
      description: hasModules ? `${moduleCount} module(s) created` : 'At least 1 module required',
      passed: hasModules,
    },
    {
      id: 'lessons',
      label: 'Lessons & Content',
      description: hasLessons ? `${lessonCount} lesson(s) authored` : 'At least 1 lesson required across modules',
      passed: hasLessons,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='text-xl font-bold text-gray-900'>
            Submit Course for Institutional Review
          </DialogTitle>
          <DialogDescription className='text-sm text-gray-600 mt-1'>
            Before publishing to the TechSprout catalog, courses undergo administrative review to ensure curriculum quality and academic standards.
          </DialogDescription>
        </DialogHeader>

        {isLoadingCourse ? (
          <div className='py-8 space-y-4'>
            <div className='h-4 bg-gray-100 rounded animate-pulse w-3/4' />
            <div className='h-24 bg-gray-100 rounded-xl animate-pulse' />
            <div className='h-20 bg-gray-100 rounded-xl animate-pulse' />
          </div>
        ) : isCourseError ? (
          <div className='p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-sm'>
            Failed to load course details for preflight verification. Please close and try again.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className='space-y-6 mt-2'>
            {/* Error Notification */}
            {errorMessage && (
              <div className='p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2.5'>
                <AlertCircle className='w-4 h-4 text-red-600 flex-shrink-0 mt-0.5' />
                <div>
                  <p className='font-semibold'>Submission Blocked</p>
                  <p className='mt-0.5 text-red-700'>{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Preflight Checklist Section */}
            <div className='bg-gray-50/70 p-4 rounded-xl border border-gray-200 space-y-3'>
              <div className='flex items-center justify-between'>
                <span className='text-xs font-bold text-gray-700 uppercase tracking-wider'>
                  Curriculum Preflight Checklist
                </span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                    isEligible
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {isEligible ? '5 / 5 Complete' : 'Incomplete Requirements'}
                </span>
              </div>

              <div className='divide-y divide-gray-200/60'>
                {checklistItems.map((item) => (
                  <div key={item.id} className='py-2.5 flex items-start justify-between gap-3'>
                    <div className='flex items-start gap-2.5'>
                      {item.passed ? (
                        <CheckCircle2 className='w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5' />
                      ) : (
                        <AlertCircle className='w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5' />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${item.passed ? 'text-gray-900' : 'text-amber-900'}`}>
                          {item.label}
                        </p>
                        <p className='text-xs text-gray-500 mt-0.5'>{item.description}</p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        item.passed
                          ? 'text-emerald-700 bg-emerald-100/60'
                          : 'text-amber-700 bg-amber-100/60'
                      }`}
                    >
                      {item.passed ? 'Pass' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ineligible Explanation */}
            {!isEligible && (
              <div className='p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2'>
                <AlertCircle className='w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5' />
                <p>
                  Your course does not yet meet all preflight conditions. Please return to the curriculum editor to add the missing items before submitting for review.
                </p>
              </div>
            )}

            {/* Submission Notes */}
            <div className='space-y-1.5'>
              <label htmlFor='submissionNotes' className='block text-xs font-semibold text-gray-700'>
                Notes for Institutional Reviewer <span className='text-gray-400 font-normal'>(Optional)</span>
              </label>
              <Textarea
                id='submissionNotes'
                value={submissionNotes}
                onChange={(e) => setSubmissionNotes(e.target.value.slice(0, 2000))}
                placeholder='Add any comments, context, or revision notes for the administrative reviewer...'
                rows={3}
                disabled={!isEligible || submitMutation.isPending}
                className='text-sm'
              />
              <div className='flex justify-end'>
                <span className='text-[11px] text-gray-400'>
                  {submissionNotes.length} / 2000 characters
                </span>
              </div>
            </div>

            <DialogFooter className='gap-2 sm:gap-0 pt-2 border-t border-gray-100'>
              <Button
                type='button'
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={submitMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={!isEligible || submitMutation.isPending}
                className='bg-primary text-white hover:bg-primary/90 flex items-center gap-2'
              >
                {submitMutation.isPending ? (
                  <Loader2 className='w-4 h-4 animate-spin' />
                ) : (
                  <Send className='w-4 h-4' />
                )}
                <span>Submit for Review</span>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
