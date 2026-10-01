'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPublicCourseBySlug } from '@/lib/api/catalog';
import { fetchLearningCurriculum } from '@/lib/api/learning';
import {
  fetchStudentQuiz,
  startOrResumeAttempt,
  submitAttempt,
  fetchAttemptReview,
} from '@/lib/api/quizzes';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { CurriculumSidebar } from '@/components/learning/CurriculumSidebar';
import { CurriculumItemNavigation } from '@/components/learning/CurriculumItemNavigation';
import { QuizOverview } from '@/components/learning/quiz/QuizOverview';
import { QuizRunner } from '@/components/learning/quiz/QuizRunner';
import { QuizResults } from '@/components/learning/quiz/QuizResults';
import { QuizReview } from '@/components/learning/quiz/QuizReview';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { DialogTitle } from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  AlertCircle,
  GraduationCap,
  LogIn,
  RotateCcw,
  Archive,
  Menu,
  FileQuestion,
} from 'lucide-react';
import type {
  StudentActiveAttemptDto,
  StudentQuizResultDto,
  StudentQuizReviewDto,
  StudentAnswerItem,
} from '@techsprout/contracts';

type QuizViewMode = 'overview' | 'runner' | 'results' | 'review';

export default function StudentQuizWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const courseSlug = params?.courseSlug as string;
  const quizId = params?.quizId as string;

  const [mode, setMode] = useState<QuizViewMode>('overview');
  const [activeAttempt, setActiveAttempt] = useState<StudentActiveAttemptDto | null>(null);
  const [quizResult, setQuizResult] = useState<StudentQuizResultDto | null>(null);
  const [reviewData, setReviewData] = useState<StudentQuizReviewDto | null>(null);
  const [actionError, setActionError] = useState<{ message: string; code?: string } | null>(null);

  const [isMobileCurriculumOpen, setIsMobileCurriculumOpen] = useState(false);

  // 1. Current User
  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUser();

  // 2. Fetch Course details
  const {
    data: course,
    isLoading: isCourseLoading,
    isError: isCourseError,
    error: courseError,
    refetch: refetchCourse,
  } = useQuery({
    queryKey: ['publicCourse', courseSlug],
    queryFn: () => fetchPublicCourseBySlug(courseSlug),
    enabled: !!courseSlug,
    retry: 1,
  });

  const courseId = course?.id;

  // 3. Fetch Learning Curriculum
  const {
    data: curriculum,
    isLoading: isCurriculumLoading,
    isError: isCurriculumError,
    error: curriculumError,
    refetch: refetchCurriculum,
  } = useQuery({
    queryKey: ['learningCurriculum', courseId],
    queryFn: () => fetchLearningCurriculum(courseId!),
    enabled: !!courseId && !!currentUser,
    retry: 1,
  });

  // 4. Fetch Student Quiz Detail
  const {
    data: quiz,
    isLoading: isQuizLoading,
    isError: isQuizError,
    error: quizError,
    refetch: refetchQuiz,
  } = useQuery({
    queryKey: ['studentQuiz', quizId],
    queryFn: () => fetchStudentQuiz(quizId),
    enabled: !!quizId && !!currentUser,
    retry: 1,
  });

  // 5. Start / Resume Attempt Mutation
  const startAttemptMutation = useMutation({
    mutationFn: () => startOrResumeAttempt(quizId),
    onSuccess: (data: StudentActiveAttemptDto) => {
      setActionError(null);
      setActiveAttempt(data);
      setMode('runner');
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setActionError({
        message: resp?.message || 'Failed to start quiz attempt.',
        code: resp?.errorCode || 'START_ATTEMPT_ERROR',
      });
    },
  });

  // 6. Submit Attempt Mutation
  const submitAttemptMutation = useMutation({
    mutationFn: async (answers: StudentAnswerItem[]) => {
      if (!activeAttempt) throw new Error('No active attempt to submit');
      return submitAttempt(quizId, activeAttempt.id, answers);
    },
    onSuccess: (data: StudentQuizResultDto) => {
      setActionError(null);
      setQuizResult(data);
      setActiveAttempt(null);
      setMode('results');

      // Invalidate curriculum and quiz stats so sidebar updates immediately
      queryClient.invalidateQueries({ queryKey: ['learningCurriculum', courseId] });
      queryClient.invalidateQueries({ queryKey: ['studentQuiz', quizId] });
      queryClient.invalidateQueries({ queryKey: ['userEnrollments'] });
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setActionError({
        message: resp?.message || 'Failed to submit quiz attempt.',
        code: resp?.errorCode || 'SUBMIT_ERROR',
      });
    },
  });

  // 7. Fetch Review Mutation
  const fetchReviewMutation = useMutation({
    mutationFn: async (attemptId: string) => {
      return fetchAttemptReview(quizId, attemptId);
    },
    onSuccess: (data: StudentQuizReviewDto) => {
      setActionError(null);
      setReviewData(data);
      setMode('review');
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      setActionError({
        message: resp?.message || 'Failed to load attempt review.',
        code: resp?.errorCode || 'REVIEW_ERROR',
      });
    },
  });

  const isLoading =
    isAuthLoading ||
    isCourseLoading ||
    (!!currentUser && !!courseId && (isCurriculumLoading || isQuizLoading));

  // --- ERROR & AUTH STATES ---

  // 401 Unauthenticated
  if (!isAuthLoading && !currentUser) {
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC]' data-testid='quiz-unauthenticated'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200/80 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto'>
            <GraduationCap className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Authentication Required</h2>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            Please log in with your student account to access this quiz.
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/login?redirect=${encodeURIComponent(`/learn/${courseSlug}/quiz/${quizId}`)}`}>
              <Button className='rounded-xl text-xs font-semibold px-6 py-2.5 bg-primary text-white hover:bg-primary/90'>
                <LogIn className='w-4 h-4 mr-2' />
                Log In
              </Button>
            </Link>
            <Link href={`/courses/${courseSlug}`}>
              <Button variant='outline' className='rounded-xl text-xs font-semibold px-4 py-2.5'>
                Course Details
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className='min-h-[85vh] flex flex-col items-center justify-center px-4 bg-[#F8FAFC] space-y-4' data-testid='quiz-loading'>
        <div className='w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin' />
        <p className='text-xs sm:text-sm font-semibold text-gray-600 animate-pulse'>
          Loading assessment workspace...
        </p>
      </div>
    );
  }

  // 403 Forbidden / Enrollment Required
  const quizStatusCode = (quizError as any)?.response?.status;
  const quizErrorCode = (quizError as any)?.response?.data?.errorCode;
  if (isQuizError && (quizStatusCode === 403 || quizErrorCode === 'ENROLLMENT_REQUIRED')) {
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC]' data-testid='quiz-forbidden'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-amber-200/80 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Enrollment Required</h2>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            You must be actively enrolled in this course to take assessments.
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/courses/${courseSlug}`}>
              <Button className='rounded-xl text-xs font-bold px-6 py-2.5 bg-primary text-white hover:bg-primary/90'>
                View Course & Enroll
              </Button>
            </Link>
            <Link href='/my-courses'>
              <Button variant='outline' className='rounded-xl text-xs font-semibold px-4 py-2.5'>
                My Courses
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 404 Quiz Not Found or Other General Quiz Error
  if (isQuizError || !quiz || isCourseError || !course) {
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC]' data-testid='quiz-not-found'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-red-100 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Assessment Unavailable</h2>
          <p className='text-xs text-gray-500'>
            {(quizError as any)?.response?.data?.message ||
              'We could not load this assessment. It may have been archived or does not exist.'}
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/courses/${courseSlug}`}>
              <Button variant='outline' className='rounded-xl text-xs'>
                <ArrowLeft className='w-3.5 h-3.5 mr-1.5' />
                Course Overview
              </Button>
            </Link>
            <Button onClick={() => refetchQuiz()} className='rounded-xl text-xs'>
              <RotateCcw className='w-3.5 h-3.5 mr-1.5' />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isArchived = course.status === 'ARCHIVED';
  const progressPct = curriculum?.progressPercentage ?? 0;
  const isCourseCompleted = progressPct === 100;

  return (
    <div className='min-h-screen bg-[#F8FAFC] flex flex-col' data-testid='student-quiz-workspace'>
      {/* Top Workspace Header */}
      <header className='bg-white border-b border-gray-200 sticky top-0 z-30 shadow-2xs'>
        <div className='container mx-auto px-4 max-w-7xl h-16 flex items-center justify-between gap-4'>
          {/* Back & Course Title */}
          <div className='flex items-center space-x-3 truncate'>
            <Link
              href='/my-courses'
              className='p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition shrink-0'
              title='Back to My Courses'
            >
              <ArrowLeft className='w-4 h-4' />
            </Link>

            <div className='truncate'>
              <div className='flex items-center gap-2'>
                <h1 className='text-xs sm:text-sm font-bold text-gray-900 truncate'>
                  {course.title}
                </h1>
                {isArchived && (
                  <span className='inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full shrink-0'>
                    <Archive className='w-3 h-3' />
                    Archived
                  </span>
                )}
              </div>
              <p className='text-[11px] text-gray-400 truncate hidden sm:block'>
                {quiz.title}
              </p>
            </div>
          </div>

          {/* Progress Bar & Mobile Curriculum Trigger */}
          <div className='flex items-center space-x-4 shrink-0'>
            {/* Progress Overview */}
            <div className='hidden md:flex flex-col items-end w-36 sm:w-44'>
              <div className='flex items-center justify-between w-full text-[11px] font-bold text-gray-700 mb-1'>
                <span>Progress</span>
                <span className={isCourseCompleted ? 'text-emerald-600' : 'text-primary'}>
                  {progressPct}%
                </span>
              </div>
              <div className='w-full bg-gray-100 rounded-full h-1.5 overflow-hidden'>
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isCourseCompleted ? 'bg-emerald-500' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                />
              </div>
            </div>

            {/* Mobile Curriculum Trigger Sheet */}
            <Sheet open={isMobileCurriculumOpen} onOpenChange={setIsMobileCurriculumOpen}>
              <SheetTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  className='lg:hidden rounded-xl text-xs font-semibold border-gray-200 text-gray-700 flex items-center gap-1.5'
                >
                  <Menu className='w-4 h-4' />
                  <span>Curriculum</span>
                </Button>
              </SheetTrigger>
              <SheetContent side='right' className='w-[320px] sm:w-[380px] p-0 flex flex-col'>
                <DialogTitle className='sr-only'>Course Curriculum</DialogTitle>
                {curriculum && (
                  <CurriculumSidebar
                    curriculum={curriculum}
                    courseSlug={courseSlug}
                    activeQuizId={quizId}
                    onSelectItem={() => setIsMobileCurriculumOpen(false)}
                  />
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className='flex-1 container mx-auto px-4 max-w-7xl py-6 sm:py-8'>
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-8 items-start'>
          {/* Main Column: Active Quiz State View */}
          <div className='lg:col-span-2 space-y-6'>
            {/* Action / Mutation Error Notice */}
            {actionError && (
              <div
                className='bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-900'
                data-testid='action-error-banner'
              >
                <AlertCircle className='w-4 h-4 text-rose-600 shrink-0 mt-0.5' />
                <div className='space-y-0.5 flex-1'>
                  <p className='font-bold'>{actionError.code || 'Operation Error'}</p>
                  <p className='text-rose-700 leading-relaxed'>{actionError.message}</p>
                </div>
              </div>
            )}

            {/* View Mode 1: Overview */}
            {mode === 'overview' && (
              <QuizOverview
                quiz={quiz}
                activeAttempt={activeAttempt}
                isStartingAttempt={startAttemptMutation.isPending}
                onStartAttempt={() => startAttemptMutation.mutate()}
                onResumeAttempt={() => setMode('runner')}
                onViewReview={() => {
                  if (quizResult?.attemptId) {
                    fetchReviewMutation.mutate(quizResult.attemptId);
                  }
                }}
                isEnrollmentCompleted={isCourseCompleted}
              />
            )}

            {/* View Mode 2: Active Attempt Runner */}
            {mode === 'runner' && activeAttempt && (
              <QuizRunner
                quiz={quiz}
                attempt={activeAttempt}
                onSubmitted={async (answers) => {
                  await submitAttemptMutation.mutateAsync(answers);
                }}
                isSubmitting={submitAttemptMutation.isPending}
              />
            )}

            {/* View Mode 3: Submission Results */}
            {mode === 'results' && quizResult && (
              <QuizResults
                result={quizResult}
                quiz={quiz}
                courseSlug={courseSlug}
                curriculum={curriculum}
                onRetry={() => startAttemptMutation.mutate()}
                onViewReview={() => fetchReviewMutation.mutate(quizResult.attemptId)}
                isRetrying={startAttemptMutation.isPending}
                isEnrollmentCompleted={isCourseCompleted}
              />
            )}

            {/* View Mode 4: Full Review */}
            {mode === 'review' && reviewData && (
              <QuizReview
                review={reviewData}
                onBackToResults={() => {
                  if (quizResult) {
                    setMode('results');
                  } else {
                    setMode('overview');
                  }
                }}
              />
            )}

            {/* Bottom Mixed Curriculum Navigation */}
            {mode !== 'runner' && (
              <CurriculumItemNavigation
                courseSlug={courseSlug}
                curriculum={curriculum}
                currentItemId={quizId}
                isCourseCompleted={isCourseCompleted}
              />
            )}
          </div>

          {/* Desktop Right Column: Sticky Curriculum Sidebar */}
          <aside className='hidden lg:block lg:sticky lg:top-24 max-h-[calc(100vh-120px)] rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden'>
            {curriculum && (
              <CurriculumSidebar
                curriculum={curriculum}
                courseSlug={courseSlug}
                activeQuizId={quizId}
              />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
