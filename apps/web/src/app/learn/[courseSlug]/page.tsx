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
import { useTranslation } from '@/i18n';

export default function CourseLearningEntryPoint() {
  const params = useParams();
  const router = useRouter();
  const courseSlug = params?.courseSlug as string;
  const { t } = useTranslation();

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
            {t('myCourses.signInPrompt')}
          </Title>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            {t('myCourses.signInDescription')}
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/login?redirect=${encodeURIComponent(`/learn/${courseSlug}`)}`}>
              <Button className='rounded-xl text-xs font-semibold px-6 py-2.5 bg-primary text-white hover:bg-primary/90 cursor-pointer'>
                <LogIn className='w-4 h-4 mr-2' />
                {t('actions.login')}
              </Button>
            </Link>
            <Link href={`/courses/${courseSlug}`}>
              <Button variant='outline' className='rounded-xl text-xs font-semibold px-4 py-2.5 cursor-pointer'>
                {t('courseDetails.aboutCourse')}
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
          {t('states.loading')}
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
          <h2 className='text-xl font-bold text-gray-900'>{t('courseDetails.courseNotFound')}</h2>
          <p className='text-xs text-gray-500'>
            {(courseError as any)?.response?.data?.message || t('states.loadFailed')}
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href='/courses'>
              <Button variant='outline' size='sm' className='rounded-xl text-xs'>
                <ArrowLeft className='w-3.5 h-3.5 mr-1.5' />
                {t('courseDetails.backToCatalog')}
              </Button>
            </Link>
            <Button onClick={() => refetchCourse()} size='sm' className='rounded-xl text-xs'>
              {t('actions.retry')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Resume Error
  if (isResumeError) {
    const status = (resumeError as any)?.response?.status;
    const isForbidden = status === 403;

    return (
      <div className='min-h-[80vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200/80 shadow-xs text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-xl font-bold text-gray-900'>
            {isForbidden ? t('myCourses.signInPrompt') : t('states.error')}
          </h2>
          <p className='text-xs text-gray-500 leading-relaxed'>
            {isForbidden
              ? t('myCourses.signInDescription')
              : (resumeError as any)?.response?.data?.message || t('states.loadFailed')}
          </p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href={`/courses/${courseSlug}`}>
              <Button className='rounded-xl text-xs font-semibold px-5 py-2.5 bg-primary text-white hover:bg-primary/90'>
                {t('courseDetails.aboutCourse')}
              </Button>
            </Link>
            {!isForbidden && (
              <Button onClick={() => refetchResume()} variant='outline' size='sm' className='rounded-xl text-xs'>
                <RotateCcw className='w-3.5 h-3.5 mr-1.5' />
                {t('actions.retry')}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback: Course 100% Completed
  const firstLessonId = curriculum?.modules?.[0]?.lessons?.[0]?.id;

  return (
    <div className='min-h-[80vh] flex items-center justify-center px-4 bg-[#F8FAFC]'>
      <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-xs text-center space-y-5'>
        <div className='w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto'>
          <Trophy className='w-8 h-8' />
        </div>
        <div className='space-y-1.5'>
          <h2 className='text-2xl font-bold text-gray-900'>{t('learning.courseCompletedTitle')}</h2>
          <p className='text-xs sm:text-sm text-gray-500 leading-relaxed'>
            {course.title}
          </p>
        </div>

        <div className='pt-2 flex flex-col gap-2.5'>
          <Link href={`/learn/${courseSlug}/certificate`}>
            <Button className='w-full rounded-xl text-xs font-bold py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm flex items-center justify-center gap-2'>
              <CheckCircle2 className='w-4 h-4' />
              <span>{t('myCourses.viewCertificate')}</span>
            </Button>
          </Link>

          {firstLessonId && (
            <Link href={`/learn/${courseSlug}/${firstLessonId}`}>
              <Button variant='outline' className='w-full rounded-xl text-xs font-semibold py-2.5 flex items-center justify-center gap-2'>
                <PlayCircle className='w-4 h-4 text-primary' />
                <span>{t('courseDetails.resumeCourse')}</span>
              </Button>
            </Link>
          )}

          <Link href='/my-courses'>
            <Button variant='ghost' className='w-full rounded-xl text-xs text-gray-500'>
              {t('myCourses.pageTitle')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
