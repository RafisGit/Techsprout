'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicCourseBySlug } from '@/lib/api/catalog';
import { fetchLearningResume, fetchLearningCurriculum } from '@/lib/api/learning';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Button } from '@/components/ui/button';
import Title from '@/components/Title';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  GraduationCap,
  LogIn,
  PlayCircle,
  RotateCcw,
  Trophy,
} from 'lucide-react';

export default function CourseLearningEntryPoint() {
  const params = useParams();
  const router = useRouter();
  const courseSlug = params?.courseSlug as string;

  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUser();

  // 1. Fetch Course details to obtain course.id
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

  // 2. Fetch Resume Point
  const {
    data: resumePoint,
    isLoading: isResumeLoading,
    isError: isResumeError,
    error: resumeError,
    refetch: refetchResume,
  } = useQuery({
    queryKey: ['learningResume', course?.id],
    queryFn: () => fetchLearningResume(course!.id),
    enabled: !!course?.id && !!currentUser,
    retry: 1,
  });

  // 3. Fallback Curriculum in case resume is fully completed and student wants first lesson
  const { data: curriculum } = useQuery({
    queryKey: ['learningCurriculum', course?.id],
    queryFn: () => fetchLearningCurriculum(course!.id),
    enabled: !!course?.id && !!currentUser,
  });

  // Automatically transition to active/resume lesson if available
  useEffect(() => {
    if (resumePoint?.lessonId) {
      router.replace(`/learn/${courseSlug}/${resumePoint.lessonId}`);
    }
  }, [resumePoint, courseSlug, router]);

  const isLoading = isAuthLoading || isCourseLoading || (!!currentUser && !!course && isResumeLoading);

  // Unauthenticated State
  if (!isAuthLoading && !currentUser) {
    return (
      <div className='min-h-[80vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200/80 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto'>
            <GraduationCap className='w-8 h-8' />
          </div>
          <Title h={2} className='text-2xl font-bold text-gray-900'>
            Authentication Required
          </Title>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            Please log in with your student account to enter the course workspace.
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/login?redirect=${encodeURIComponent(`/learn/${courseSlug}`)}`}>
              <Button className='rounded-xl text-xs font-semibold px-6 py-2.5 bg-primary text-white hover:bg-primary/90'>
                <LogIn className='w-4 h-4 mr-2' />
                Log In
              </Button>
            </Link>
            <Link href={`/courses/${courseSlug}`}>
              <Button variant='outline' className='rounded-xl text-xs font-semibold px-4 py-2.5'>
                Course Overview
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading State
  if (isLoading) {
    return (
      <div className='min-h-[80vh] flex flex-col items-center justify-center px-4 bg-[#F8FAFC] space-y-4'>
        <div className='w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin' />
        <p className='text-xs sm:text-sm font-semibold text-gray-600 animate-pulse'>
          Preparing your learning workspace...
        </p>
      </div>
    );
  }

  // Course Error or 404
  if (isCourseError || !course) {
    return (
      <div className='min-h-[80vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-red-100 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Course Unavailable</h2>
          <p className='text-xs text-gray-500'>
            {(courseError as any)?.response?.data?.message ||
              'We could not load this course. It may not exist or is unavailable.'}
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href='/courses'>
              <Button variant='outline' className='rounded-xl text-xs'>
                <ArrowLeft className='w-3.5 h-3.5 mr-1.5' />
                Back to Catalog
              </Button>
            </Link>
            <Button onClick={() => refetchCourse()} className='rounded-xl text-xs'>
              <RotateCcw className='w-3.5 h-3.5 mr-1.5' />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Forbidden / Enrollment Required Error (403)
  const resumeStatusCode = (resumeError as any)?.response?.status;
  if (isResumeError && resumeStatusCode === 403) {
    return (
      <div className='min-h-[80vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-amber-200/80 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto'>
            <GraduationCap className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Enrollment Required</h2>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            You must be enrolled in <strong>{course.title}</strong> to access its learning curriculum and lessons.
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

  // Other Resume Error
  if (isResumeError) {
    return (
      <div className='min-h-[80vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-red-100 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>Failed to load workspace</h2>
          <p className='text-xs text-gray-500'>
            {(resumeError as any)?.response?.data?.message ||
              'An error occurred while resuming your study session.'}
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href='/my-courses'>
              <Button variant='outline' className='rounded-xl text-xs'>
                Dashboard
              </Button>
            </Link>
            <Button onClick={() => refetchResume()} className='rounded-xl text-xs'>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Fully Completed Course View (when no resume lessonId exists)
  const firstLessonId = curriculum?.modules?.[0]?.lessons?.[0]?.id;

  return (
    <div className='min-h-[80vh] flex items-center justify-center px-4 bg-[#F8FAFC] py-16'>
      <div className='max-w-lg w-full bg-white rounded-3xl p-8 sm:p-10 border border-gray-200/80 shadow-md text-center space-y-6'>
        <div className='w-20 h-20 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-xs'>
          <Trophy className='w-10 h-10 text-amber-500' />
        </div>

        <div className='space-y-2'>
          <span className='inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800'>
            <CheckCircle2 className='w-3.5 h-3.5' />
            100% Course Completed
          </span>
          <h1 className='text-2xl font-extrabold text-gray-900'>{course.title}</h1>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            Congratulations! You have completed all lessons in this course. You can review any lesson at any time.
          </p>
        </div>

        <div className='pt-2 flex flex-col sm:flex-row justify-center gap-3'>
          <Link href={`/learn/${courseSlug}/certificate`} data-testid='btn-view-certificate'>
            <Button className='w-full sm:w-auto rounded-xl text-xs font-bold px-6 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs flex items-center justify-center gap-1.5'>
              <Trophy className='w-4 h-4 text-amber-300' />
              <span>View Certificate</span>
            </Button>
          </Link>
          {firstLessonId && (
            <Link href={`/learn/${courseSlug}/${firstLessonId}`}>
              <Button variant='outline' className='w-full sm:w-auto rounded-xl text-xs font-bold px-5 py-2.5'>
                <PlayCircle className='w-4 h-4 mr-1.5' />
                Review From Beginning
              </Button>
            </Link>
          )}
          <Link href='/my-courses'>
            <Button variant='ghost' className='w-full sm:w-auto rounded-xl text-xs font-semibold px-4 py-2.5'>
              Back to My Courses
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
