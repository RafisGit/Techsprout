'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPublicCourseBySlug } from '@/lib/api/catalog';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { fetchCourseEnrollmentStatus, selfEnroll } from '@/lib/api/learning';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { TextBadge } from '@/components/ui/text-badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Clock,
  FileText,
  Video,
  Lock,
  PlayCircle,
  Layers,
  Globe,
  ArrowLeft,
  AlertCircle,
  BookOpen,
  FileCheck,
  User,
} from 'lucide-react';
import type { LessonDto, ModuleDto } from '@techsprout/contracts';
import { InstructorBioCard } from '@/components/public/InstructorBioCard';
import { useTranslation } from '@/i18n';

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;
  const { t, locale, formatNumber, formatCurrency, formatPercent } = useTranslation();

  const [activePreviewLesson, setActivePreviewLesson] = useState<LessonDto | null>(null);

  const {
    data: course,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['publicCourse', slug],
    queryFn: () => fetchPublicCourseBySlug(slug),
    enabled: !!slug,
    retry: 1,
  });

  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUser();

  const { data: enrollmentStatus } = useQuery({
    queryKey: ['courseEnrollmentStatus', course?.id],
    queryFn: () => fetchCourseEnrollmentStatus(course!.id),
    enabled: !!course?.id && !!currentUser,
    staleTime: 30 * 1000,
  });

  const enrollMutation = useMutation({
    mutationFn: () => selfEnroll(course!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courseEnrollmentStatus', course?.id] });
      queryClient.invalidateQueries({ queryKey: ['userEnrollments'] });
      if (course?.slug) {
        router.push(`/learn/${course.slug}`);
      }
    },
  });

  const enrollErrorMsg = (enrollMutation.error as any)?.response?.data?.message;
  const isEnrolled = enrollmentStatus?.isEnrolled === true;
  const enrollment = enrollmentStatus?.enrollment;
  const isCompleted = enrollment?.status === 'COMPLETED';
  const isArchived = course?.status === 'ARCHIVED';

  function formatDuration(minutes?: number | null): string {
    if (!minutes) return t('courseDetails.selfPaced');
    if (minutes < 60) return t('catalog.mins', { count: formatNumber(minutes) });
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return remaining > 0
      ? t('catalog.hoursMins', { hours: formatNumber(hours), mins: formatNumber(remaining) })
      : t('catalog.hoursOnly', { hours: formatNumber(hours) });
  }

  function formatLessonDuration(seconds?: number | null): string {
    if (!seconds) return t('catalog.mins', { count: formatNumber(5) });
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${formatNumber(secs)}s`;
    return secs > 0
      ? `${formatNumber(mins)}m ${formatNumber(secs)}s`
      : t('catalog.mins', { count: formatNumber(mins) });
  }

  if (isLoading) {
    return (
      <div className='min-h-screen bg-gray-50/50 pb-20'>
        {/* Hero Skeleton */}
        <div className='bg-accent py-20 animate-pulse'>
          <div className='container mx-auto px-4 max-w-6xl space-y-4'>
            <div className='h-6 w-24 bg-white/20 rounded-full' />
            <div className='h-10 w-3/4 bg-white/20 rounded-xl' />
            <div className='h-4 w-1/2 bg-white/20 rounded' />
            <div className='flex gap-4 pt-4'>
              <div className='h-6 w-28 bg-white/20 rounded-md' />
              <div className='h-6 w-28 bg-white/20 rounded-md' />
              <div className='h-6 w-28 bg-white/20 rounded-md' />
            </div>
          </div>
        </div>

        {/* Content Skeleton */}
        <div className='container mx-auto px-4 max-w-6xl py-12 grid grid-cols-1 lg:grid-cols-3 gap-8'>
          <div className='lg:col-span-2 space-y-6'>
            <div className='h-64 bg-white rounded-2xl border border-gray-100 p-6 animate-pulse' />
            <div className='h-96 bg-white rounded-2xl border border-gray-100 p-6 animate-pulse' />
          </div>
          <div>
            <div className='h-96 bg-white rounded-2xl border border-gray-100 p-6 animate-pulse' />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !course) {
    const statusCode = (error as any)?.response?.status;
    const errorMessage =
      statusCode === 404
        ? 'This course is currently unavailable or does not exist. It may be in draft mode, archived, or marked as private.'
        : (error as any)?.response?.data?.message || t('states.loadFailed');

    return (
      <div className='min-h-[70vh] flex items-center justify-center px-4 py-16 bg-gray-50'>
        <div className='max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200 shadow-sm text-center space-y-4'>
          <div className='w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto'>
            <AlertCircle className='w-8 h-8' />
          </div>
          <h2 className='text-2xl font-bold text-gray-900'>{t('courseDetails.courseNotFound')}</h2>
          <p className='text-xs text-gray-500 leading-relaxed'>{errorMessage}</p>
          <div className='pt-2 flex justify-center gap-3'>
            <Link href='/courses'>
              <Button variant='outline' size='sm' className='rounded-xl text-xs'>
                <ArrowLeft className='w-3.5 h-3.5 mr-1.5' />
                {t('courseDetails.backToCatalog')}
              </Button>
            </Link>
            {statusCode !== 404 && (
              <Button onClick={() => refetch()} size='sm' className='rounded-xl text-xs'>
                {t('actions.retry')}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isFree = Number(course.price) === 0 || course.price === '0.00';
  const currency = course.currency || 'BDT';
  const formattedPrice = isFree
    ? t('catalog.free')
    : formatCurrency(course.price, currency);

  const modules = (course.modules || []).slice().sort((a, b) => a.position - b.position);
  const totalLessons = modules.reduce((acc, m) => acc + (m.lessons?.length || 0), 0);

  const levelKey = (course.level || '').toLowerCase();
  const levelText =
    levelKey === 'beginner'
      ? t('catalog.beginner')
      : levelKey === 'intermediate'
      ? t('catalog.intermediate')
      : levelKey === 'advanced'
      ? t('catalog.advanced')
      : t('catalog.allLevels');

  return (
    <div className='min-h-screen bg-[#F8FAFC] pb-24'>
      {/* Course Hero Banner */}
      <section className='bg-accent text-white py-16 lg:py-20 relative overflow-hidden'>
        <div className='container mx-auto px-4 max-w-6xl relative z-10'>
          {/* Breadcrumb / Back */}
          <div className='mb-6 flex items-center gap-2 text-xs text-white/70'>
            <Link href='/courses' className='hover:text-white transition-colors flex items-center gap-1'>
              <ArrowLeft className='w-3.5 h-3.5' />
              <span>{t('catalog.pageTitle')}</span>
            </Link>
            <span>/</span>
            {course.category && (
              <>
                <Link
                  href={`/categories/${course.category.slug}`}
                  className='hover:text-white transition-colors'
                >
                  {course.category.name}
                </Link>
                <span>/</span>
              </>
            )}
            <span className='text-white truncate max-w-[200px]'>{course.title}</span>
          </div>

          <div className='space-y-4 max-w-3xl'>
            {course.category && (
              <TextBadge className='bg-primary text-white rounded-full font-semibold text-xs px-3.5 py-1 shadow-xs'>
                {course.category.name}
              </TextBadge>
            )}

            <Title h={1} className='text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight'>
              {course.title}
            </Title>

            {course.shortDescription && (
              <p className='text-sm sm:text-base text-white/80 leading-relaxed'>
                {course.shortDescription}
              </p>
            )}

            {/* Quick Meta Row */}
            <div className='flex flex-wrap items-center gap-4 sm:gap-6 pt-2 text-xs sm:text-sm text-white/90'>
              <div className='flex items-center gap-2'>
                <User className='w-4 h-4 text-accent-foreground/80' />
                <span>{t('courseDetails.instructor')}: <strong>{course.instructor?.name || 'TechSprout Faculty'}</strong></span>
              </div>
              <div className='flex items-center gap-1.5'>
                <FileText className='w-4 h-4' />
                <span>{t('catalog.lessonsCount', { count: formatNumber(totalLessons) })}</span>
              </div>
              <div className='flex items-center gap-1.5'>
                <Clock className='w-4 h-4' />
                <span>{formatDuration(course.durationMinutes)}</span>
              </div>
              <div className='flex items-center gap-1.5 capitalize'>
                <Layers className='w-4 h-4' />
                <span>{levelText}</span>
              </div>
              <div className='flex items-center gap-1.5'>
                <Globe className='w-4 h-4' />
                <span>{course.language || 'English'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Grid Content */}
      <section className='container mx-auto px-4 max-w-6xl mt-8 lg:-mt-8 relative z-20'>
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-8 items-start'>
          {/* Left Column: Syllabus & Content */}
          <div className='lg:col-span-2 space-y-8'>
            {/* Active Preview Lesson Player (if selected) */}
            {activePreviewLesson && (
              <div className='bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-4'>
                <div className='flex items-center justify-between pb-3 border-b border-gray-100'>
                  <div className='flex items-center space-x-2 text-xs font-bold text-primary uppercase tracking-wider'>
                    <PlayCircle className='w-4 h-4' />
                    <span>{t('courseDetails.openPreview')}</span>
                  </div>
                  <button
                    onClick={() => setActivePreviewLesson(null)}
                    className='text-xs text-gray-400 hover:text-gray-600 underline cursor-pointer'
                  >
                    {t('actions.cancel')}
                  </button>
                </div>

                <h3 className='text-base font-bold text-gray-900'>{activePreviewLesson.title}</h3>

                {activePreviewLesson.mediaUrl ? (
                  <div className='aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-md'>
                    <video
                      src={activePreviewLesson.mediaUrl}
                      controls
                      controlsList='nodownload'
                      className='w-full h-full object-cover'
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                ) : activePreviewLesson.content ? (
                  <div className='p-6 bg-gray-50 rounded-2xl text-sm text-gray-700 leading-relaxed font-sans'>
                    {activePreviewLesson.content}
                  </div>
                ) : (
                  <p className='text-xs text-gray-500 italic p-4 bg-gray-50 rounded-xl'>
                    {t('learning.videoUnavailableDesc')}
                  </p>
                )}
              </div>
            )}

            {/* Course Overview / Description */}
            <div className='bg-white rounded-3xl border border-gray-200/80 shadow-xs p-6 sm:p-8 space-y-4'>
              <Title h={3} className='text-xl font-bold text-gray-900'>
                {t('courseDetails.aboutCourse')}
              </Title>
              <div className='text-sm sm:text-base text-gray-600 leading-relaxed space-y-3 whitespace-pre-line'>
                {course.description || course.shortDescription || 'No detailed syllabus text provided.'}
              </div>
            </div>

            {/* Curriculum Structure (Modules & Lessons) */}
            <div className='bg-white rounded-3xl border border-gray-200/80 shadow-xs p-6 sm:p-8 space-y-6'>
              <div className='flex items-center justify-between'>
                <div>
                  <Title h={3} className='text-xl font-bold text-gray-900'>
                    {t('courseDetails.curriculum')}
                  </Title>
                  <p className='text-xs text-gray-500 mt-1'>
                    {t('courseDetails.modulesCount', { count: formatNumber(modules.length) })} • {t('catalog.lessonsCount', { count: formatNumber(totalLessons) })}
                  </p>
                </div>
              </div>

              {modules.length === 0 ? (
                <div className='p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200'>
                  <BookOpen className='w-8 h-8 text-gray-300 mx-auto mb-2' />
                  <p className='text-xs text-gray-500'>{t('states.empty')}</p>
                </div>
              ) : (
                <Accordion type='multiple' defaultValue={modules.map((m) => m.id)} className='space-y-3'>
                  {modules.map((mod: ModuleDto, mIdx: number) => {
                    const sortedLessons = (mod.lessons || []).slice().sort((a, b) => a.position - b.position);

                    return (
                      <AccordionItem
                        key={mod.id}
                        value={mod.id}
                        className='border border-gray-200 rounded-2xl overflow-hidden px-4 py-1 bg-gray-50/50'
                      >
                        <AccordionTrigger className='hover:no-underline py-3 text-left font-semibold text-gray-900'>
                          <div className='flex flex-col sm:flex-row sm:items-center justify-between w-full pr-4 text-sm gap-1'>
                            <span>
                              {formatNumber(mIdx + 1)}. {mod.title}
                            </span>
                            <span className='text-xs text-gray-400 font-normal'>
                              {t('catalog.lessonsCount', { count: formatNumber(sortedLessons.length) })}
                            </span>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className='pt-2 pb-3 space-y-2 border-t border-gray-200/60 mt-1'>
                          {mod.description && (
                            <p className='text-xs text-gray-500 mb-3 italic px-2'>
                              {mod.description}
                            </p>
                          )}

                          {sortedLessons.length === 0 ? (
                            <p className='text-xs text-gray-400 px-2'>{t('states.empty')}</p>
                          ) : (
                            sortedLessons.map((lesson: LessonDto, lIdx: number) => {
                              const hasPreview = lesson.isPreview === true;

                              return (
                                <div
                                  key={lesson.id}
                                  className={`flex items-center justify-between p-3 rounded-xl transition ${
                                    hasPreview ? 'bg-white hover:bg-primary/5 cursor-pointer shadow-2xs' : 'bg-transparent text-gray-500'
                                  }`}
                                  onClick={() => {
                                    if (hasPreview) {
                                      setActivePreviewLesson(lesson);
                                      window.scrollTo({ top: 400, behavior: 'smooth' });
                                    }
                                  }}
                                >
                                  <div className='flex items-center space-x-3 truncate'>
                                    {lesson.lessonType === 'VIDEO' ? (
                                      <Video className={`w-4 h-4 shrink-0 ${hasPreview ? 'text-primary' : 'text-gray-400'}`} />
                                    ) : lesson.lessonType === 'PDF' ? (
                                      <FileCheck className={`w-4 h-4 shrink-0 ${hasPreview ? 'text-primary' : 'text-gray-400'}`} />
                                    ) : (
                                      <FileText className={`w-4 h-4 shrink-0 ${hasPreview ? 'text-primary' : 'text-gray-400'}`} />
                                    )}

                                    <div className='truncate'>
                                      <p className={`text-xs font-medium truncate ${hasPreview ? 'text-gray-900' : 'text-gray-600'}`}>
                                        {formatNumber(lIdx + 1)}. {lesson.title}
                                      </p>
                                    </div>
                                  </div>

                                  <div className='flex items-center space-x-2.5 shrink-0 pl-2'>
                                    <span className='text-[11px] text-gray-400'>
                                      {formatLessonDuration(lesson.durationSeconds)}
                                    </span>

                                    {hasPreview ? (
                                      <span className='inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200'>
                                        <PlayCircle className='w-3 h-3' />
                                        <span>{t('courseDetails.preview')}</span>
                                      </span>
                                    ) : (
                                      <span title={t('courseDetails.locked')}>
                                        <Lock className='w-3.5 h-3.5 text-gray-300' />
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </div>

            {/* Instructor Biography */}
            <InstructorBioCard instructor={course.instructor} />
          </div>

          {/* Right Column: Sticky Sidebar Card */}
          <aside className='space-y-6 lg:sticky lg:top-24'>
            <div className='bg-white rounded-3xl border border-gray-200 shadow-md overflow-hidden p-6 space-y-6'>
              {/* Thumbnail Image */}
              <div className='relative h-[220px] w-full rounded-2xl overflow-hidden bg-gray-100'>
                {course.thumbnailUrl ? (
                  <Image
                    src={course.thumbnailUrl}
                    alt={course.title}
                    fill
                    className='object-cover'
                    sizes='(max-width: 1024px) 100vw, 360px'
                  />
                ) : (
                  <div className='w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold text-sm'>
                    TechSprout LMS
                  </div>
                )}
              </div>

              {/* Price Display */}
              <div className='flex items-baseline justify-between border-b border-gray-100 pb-4'>
                <span className='text-xs font-semibold text-gray-400 uppercase tracking-wider'>{t('courseDetails.priceLabel')}</span>
                <span className='text-3xl font-extrabold text-primary font-lexend'>
                  {formattedPrice}
                </span>
              </div>

              {/* Specification List */}
              <div className='space-y-3 text-xs text-gray-600'>
                <div className='flex items-center justify-between'>
                  <span className='text-gray-400'>{t('courseDetails.instructor')}:</span>
                  <span className='font-semibold text-gray-800'>{course.instructor?.name || 'TechSprout Faculty'}</span>
                </div>
                {course.category && (
                  <div className='flex items-center justify-between'>
                    <span className='text-gray-400'>{t('catalog.categories')}:</span>
                    <Link
                      href={`/categories/${course.category.slug}`}
                      className='font-semibold text-primary hover:underline'
                    >
                      {course.category.name}
                    </Link>
                  </div>
                )}
                <div className='flex items-center justify-between'>
                  <span className='text-gray-400'>{t('catalog.level')}:</span>
                  <span className='font-semibold text-gray-800 capitalize'>
                    {levelText}
                  </span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-gray-400'>{t('language.label')}:</span>
                  <span className='font-semibold text-gray-800'>{course.language || 'English'}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-gray-400'>{t('courseDetails.modulesCount', { count: '' })}:</span>
                  <span className='font-semibold text-gray-800'>{formatNumber(modules.length)}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-gray-400'>{t('catalog.lessonsCount', { count: '' })}:</span>
                  <span className='font-semibold text-gray-800'>{formatNumber(totalLessons)}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-gray-400'>{t('catalog.flexibleDuration')}:</span>
                  <span className='font-semibold text-gray-800'>{formatDuration(course.durationMinutes)}</span>
                </div>
              </div>

              {/* Action Button & Enrollment CTA */}
              <div className='pt-2 space-y-2'>
                {!isAuthLoading && !currentUser ? (
                  <>
                    <Button
                      className='w-full rounded-2xl py-6 text-sm font-bold bg-primary text-white hover:bg-primary/90 shadow-md cursor-pointer'
                      onClick={() =>
                        router.push(
                          `/login?redirect=${encodeURIComponent(
                            isFree ? `/courses/${slug}` : `/checkout/${course.slug}`
                          )}`
                        )
                      }
                    >
                      {t('actions.login')}
                    </Button>
                    <p className='text-[11px] text-gray-400 text-center'>
                      {t('myCourses.signInDescription')}
                    </p>
                  </>
                ) : isEnrolled ? (
                  <>
                    <Button
                      className={`w-full rounded-2xl py-6 text-sm font-bold shadow-md transition cursor-pointer ${
                        isCompleted
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-primary text-white hover:bg-primary/90'
                      }`}
                      onClick={() => router.push(`/learn/${course.slug}`)}
                    >
                      {isCompleted ? t('actions.viewDetails') : t('courseDetails.resumeCourse')}
                    </Button>
                    <p className='text-[11px] text-gray-500 text-center font-medium'>
                      {t('courseDetails.enrolled')} • {formatPercent((enrollment?.progressPercentage ?? 0) / 100)} {t('courseDetails.completed')}
                    </p>
                  </>
                ) : isArchived ? (
                  <>
                    <Button
                      disabled
                      className='w-full rounded-2xl py-6 text-sm font-bold bg-gray-200 text-gray-500 cursor-not-allowed shadow-none'
                    >
                      {t('courseDetails.archivedNotice')}
                    </Button>
                    <p className='text-[11px] text-amber-600 text-center'>
                      {t('courseDetails.archivedNotice')}
                    </p>
                  </>
                ) : !isFree ? (
                  <>
                    <Button
                      className='w-full rounded-2xl py-6 text-sm font-bold bg-primary text-white hover:bg-primary/90 shadow-md transition cursor-pointer'
                      onClick={() => router.push(`/checkout/${course.slug}`)}
                    >
                      {t('courseDetails.enrollNow')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      disabled={enrollMutation.isPending}
                      className='w-full rounded-2xl py-6 text-sm font-bold bg-primary text-white hover:bg-primary/90 shadow-md transition cursor-pointer'
                      onClick={() => enrollMutation.mutate()}
                    >
                      {enrollMutation.isPending ? t('courseDetails.enrolling') : t('courseDetails.enrollNow')}
                    </Button>
                    {enrollErrorMsg && (
                      <p className='text-[11px] text-red-500 text-center font-medium'>
                        {enrollErrorMsg}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
