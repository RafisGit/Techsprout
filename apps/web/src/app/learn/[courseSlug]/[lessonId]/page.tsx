'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPublicCourseBySlug } from '@/lib/api/catalog';
import {
  fetchLearningCurriculum,
  fetchLearningLesson,
  toggleLessonComplete,
} from '@/lib/api/learning';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { CurriculumSidebar } from '@/components/learning/CurriculumSidebar';
import { LessonViewer } from '@/components/learning/LessonViewer';
import { LessonNavigation } from '@/components/learning/LessonNavigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { DialogTitle } from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  LogIn,
  RotateCcw,
  Archive,
  Menu,
} from 'lucide-react';

export default function LessonLearningWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const courseSlug = params?.courseSlug as string;
  const lessonId = params?.lessonId as string;

  const [isMobileCurriculumOpen, setIsMobileCurriculumOpen] = useState(false);

  // 1. Current User
  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUser();

  // 2. Fetch Course Details by slug to get course.id
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

  // 4. Fetch Active Lesson Content
  const {
    data: lesson,
    isLoading: isLessonLoading,
    isError: isLessonError,
    error: lessonError,
    refetch: refetchLesson,
  } = useQuery({
    queryKey: ['learningLesson', courseId, lessonId],
    queryFn: () => fetchLearningLesson(courseId!, lessonId),
    enabled: !!courseId && !!lessonId && !!currentUser,
    retry: 1,
  });

  // 5. Toggle Lesson Complete Mutation
  const toggleMutation = useMutation({
    mutationFn: async (completed: boolean) => {
      if (!courseId || !lessonId) return;
      return toggleLessonComplete(courseId, lessonId, completed);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learningCurriculum', courseId] });
      queryClient.invalidateQueries({ queryKey: ['learningLesson', courseId, lessonId] });
      queryClient.invalidateQueries({ queryKey: ['userEnrollments'] });
    },
  });

  const handleLessonCompleted = () => {
    queryClient.invalidateQueries({ queryKey: ['learningCurriculum', courseId] });
    queryClient.invalidateQueries({ queryKey: ['learningLesson', courseId, lessonId] });
    queryClient.invalidateQueries({ queryKey: ['userEnrollments'] });
  };

  const handleProgressUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['learningCurriculum', courseId] });
  };

  const isLoading =
    isAuthLoading ||
    isCourseLoading ||
    (!!currentUser && !!courseId && (isCurriculumLoading || isLessonLoading));

  // Unauthenticated State
  if (!isAuthLoading && !currentUser) {
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200/80 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto'>
            <GraduationCap className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Authentication Required</h2>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            Please log in with your student account to access this lesson.
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link
              href={`/login?redirect=${encodeURIComponent(
                `/learn/${courseSlug}/${lessonId}`
              )}`}
            >
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

  // Loading Skeleton
  if (isLoading) {
    return (
      <div className='min-h-[85vh] bg-[#F8FAFC] flex flex-col'>
        <div className='bg-white border-b border-gray-200 h-16 w-full animate-pulse' />
        <div className='container mx-auto px-4 max-w-7xl py-8 grid grid-cols-1 lg:grid-cols-3 gap-8'>
          <div className='lg:col-span-2 space-y-6'>
            <div className='aspect-video w-full bg-gray-200 rounded-3xl animate-pulse' />
            <div className='h-20 bg-white rounded-2xl animate-pulse' />
          </div>
          <div className='hidden lg:block h-[500px] bg-white rounded-3xl border border-gray-100 animate-pulse' />
        </div>
      </div>
    );
  }

  // Course Error
  if (isCourseError || !course) {
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-red-100 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Course Unavailable</h2>
          <p className='text-xs text-gray-500'>
            {(courseError as any)?.response?.data?.message ||
              'This course does not exist or is currently unavailable.'}
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href='/my-courses'>
              <Button variant='outline' className='rounded-xl text-xs'>
                <ArrowLeft className='w-3.5 h-3.5 mr-1.5' />
                My Courses
              </Button>
            </Link>
            <Button onClick={() => refetchCourse()} className='rounded-xl text-xs'>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Forbidden / Enrollment Required Error (403)
  const curriculumStatus = (curriculumError as any)?.response?.status;
  const lessonStatus = (lessonError as any)?.response?.status;

  if (curriculumStatus === 403 || lessonStatus === 403) {
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-amber-200/80 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto'>
            <GraduationCap className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Enrollment Required</h2>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            You must be enrolled in <strong>{course.title}</strong> to view this lesson.
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/courses/${courseSlug}`}>
              <Button className='rounded-xl text-xs font-semibold px-5 py-2.5 bg-primary text-white hover:bg-primary/90'>
                Enroll in Course
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

  // Lesson Not Found (404)
  if (lessonStatus === 404 || !lesson) {
    return (
      <div className='min-h-[85vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center mx-auto'>
            <BookOpen className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Lesson Not Found</h2>
          <p className='text-xs text-gray-500'>
            This lesson could not be found or has been removed from the course curriculum.
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/learn/${courseSlug}`}>
              <Button className='rounded-xl text-xs font-semibold px-5 py-2.5 bg-primary text-white hover:bg-primary/90'>
                Resume Course
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

  const isArchived = course.status === 'ARCHIVED';
  const progressPct = curriculum?.progressPercentage ?? 0;
  const isCourseCompleted = progressPct === 100;

  return (
    <div className='min-h-screen bg-[#F8FAFC] flex flex-col'>
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
                {lesson.title}
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
                    activeLessonId={lessonId}
                    onSelectLesson={() => setIsMobileCurriculumOpen(false)}
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
          {/* Main Column: Active Lesson & Controls */}
          <div className='lg:col-span-2 space-y-6'>
            {/* Archived Course Notice for Enrolled Learner */}
            {isArchived && (
              <div className='bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-start space-x-3 text-xs text-amber-800'>
                <Archive className='w-4 h-4 text-amber-600 shrink-0 mt-0.5' />
                <div>
                  <strong className='font-bold'>Archived Course Access:</strong> This course is archived
                  and no longer accepts new students. As an enrolled student, you retain full access to all
                  lessons, media streaming, checkpointing, and completion.
                </div>
              </div>
            )}

            {/* Lesson Content Viewer */}
            <LessonViewer
              key={lesson.id}
              courseId={course.id}
              courseSlug={courseSlug}
              lesson={lesson}
              onToggleComplete={async (completed) => {
                await toggleMutation.mutateAsync(completed);
              }}
              onLessonCompleted={handleLessonCompleted}
              onProgressUpdate={handleProgressUpdate}
            />

            {/* Previous / Next Lesson Navigation */}
            <LessonNavigation
              courseSlug={courseSlug}
              navigation={lesson.navigation}
              isCourseCompleted={isCourseCompleted}
            />
          </div>

          {/* Desktop Right Column: Sticky Curriculum Sidebar */}
          <aside className='hidden lg:block lg:sticky lg:top-24 max-h-[calc(100vh-120px)] rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden'>
            {curriculum && (
              <CurriculumSidebar
                curriculum={curriculum}
                courseSlug={courseSlug}
                activeLessonId={lessonId}
              />
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
