'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAdminCourseById,
  updateCourse,
  fetchAdminCategories,
  fetchAdminUsers,
} from '@/lib/api/catalog';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { CourseStatusBadge, VisibilityBadge } from '@/components/admin/StatusBadge';
import { CurriculumManager } from '@/components/admin/CurriculumManager';
import { PublishingActions } from '@/components/admin/PublishingActions';
import { MediaUploader } from '@/components/admin/MediaUploader';
import { useTranslation } from '@/i18n/client';
import {
  ArrowLeft,
  Save,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Layers,
  Settings,
  Send,
  Loader2,
} from 'lucide-react';
import type {
  CourseLevel,
  CourseVisibility,
  UpdateCourseRequest,
} from '@techsprout/contracts';

type ActiveTab = 'curriculum' | 'settings' | 'publishing';

export default function AdminCourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const { t, formatNumber } = useTranslation();

  const courseId = params?.id as string;
  const [activeTab, setActiveTab] = useState<ActiveTab>('curriculum');

  // Form states for settings tab
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [price, setPrice] = useState('0.00');
  const [currency, setCurrency] = useState('BDT');
  const [level, setLevel] = useState<CourseLevel>('BEGINNER');
  const [language, setLanguage] = useState('English');
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [visibility, setVisibility] = useState<CourseVisibility>('PUBLIC');
  const [thumbnailMediaId, setThumbnailMediaId] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Query Course Detail
  const {
    data: course,
    isLoading: isLoadingCourse,
    isError: isCourseError,
    error: courseError,
    refetch: refetchCourse,
  } = useQuery({
    queryKey: ['adminCourse', courseId],
    queryFn: () => fetchAdminCourseById(courseId),
    enabled: !!courseId,
  });

  // Query categories
  const { data: categories = [] } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: fetchAdminCategories,
    staleTime: 5 * 60 * 1000,
  });

  // Query instructors (for admin role only)
  const { data: usersList = [] } = useQuery({
    queryKey: ['admin', 'users', 'instructors'],
    queryFn: () => fetchAdminUsers(100),
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const instructors = usersList.filter(
    (u) => u.role === 'instructor' || u.role === 'admin'
  );

  // Sync loaded course data into form states
  useEffect(() => {
    if (course) {
      setTitle(course.title || '');
      setSlug(course.slug || '');
      setShortDescription(course.shortDescription || '');
      setDescription(course.description || '');
      setCategoryId(course.categoryId || '');
      setInstructorId(course.instructorId || '');
      setPrice(String(course.price ?? '0.00'));
      setCurrency(course.currency || 'BDT');
      setLevel(course.level || 'BEGINNER');
      setLanguage(course.language || 'English');
      setDurationMinutes(course.durationMinutes || 0);
      setVisibility(course.visibility || 'PUBLIC');
      setThumbnailMediaId(course.thumbnailMediaId || null);
      setThumbnailUrl(course.thumbnailUrl || null);
    }
  }, [course]);

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: (payload: UpdateCourseRequest) => updateCourse(courseId, payload),
    onSuccess: (updated) => {
      setSaveSuccess(t('admin.courseForm.saveSuccess'));
      setSaveError(null);
      setFieldErrors({});
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      setTimeout(() => setSaveSuccess(null), 4000);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      if (resp?.errors) {
        setFieldErrors(resp.errors);
      }
      setSaveError(resp?.message || err?.message || t('admin.courseForm.saveError'));
      setSaveSuccess(null);
    },
  });

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(null);
    setSaveError(null);
    setFieldErrors({});

    const payload: UpdateCourseRequest = {
      title: title.trim(),
      slug: slug.trim(),
      shortDescription: shortDescription.trim() || null,
      description: description.trim() || null,
      categoryId: categoryId || undefined,
      instructorId: isAdmin && instructorId ? instructorId : undefined,
      price: parseFloat(price) || 0,
      currency,
      level,
      language: language.trim() || 'English',
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      visibility,
      thumbnailMediaId: thumbnailMediaId || null,
    };

    updateMutation.mutate(payload);
  };

  if (isLoadingCourse) {
    return (
      <div className='p-16 text-center'>
        <Loader2 className='w-8 h-8 text-primary animate-spin mx-auto mb-4' />
        <p className='text-sm text-gray-500'>{t('admin.courses.loadingCourses')}</p>
      </div>
    );
  }

  if (isCourseError || !course) {
    return (
      <div className='max-w-xl mx-auto p-12 text-center bg-white rounded-2xl border border-gray-200 shadow-xs'>
        <AlertCircle className='w-12 h-12 text-red-500 mx-auto mb-3' />
        <h3 className='text-lg font-bold text-gray-900 mb-1'>{t('admin.overview.errorLoading')}</h3>
        <p className='text-xs text-gray-500 mb-6'>
          {(courseError as any)?.response?.data?.message || 'The requested course does not exist.'}
        </p>
        <Link
          href='/admin/courses'
          className='px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition'
        >
          {t('admin.courseForm.backToCourses')}
        </Link>
      </div>
    );
  }

  const modulesCount = course.modules?.length || 0;

  return (
    <div className='space-y-6 pb-12'>
      {/* Top Breadcrumb & Metadata Header */}
      <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs'>
        <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-4'>
          <div className='flex items-start space-x-3'>
            <Link
              href='/admin/courses'
              className='p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition mt-0.5'
              title={t('admin.courseForm.backToCourses')}
            >
              <ArrowLeft className='w-4 h-4' />
            </Link>
            <div>
              <div className='flex items-center space-x-2'>
                <span className='px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200'>
                  {course.category?.name || 'Uncategorized'}
                </span>
                <span className='text-xs text-gray-400 font-mono'>/{course.slug}</span>
              </div>
              <h1 className='text-xl sm:text-2xl font-bold text-gray-900 tracking-tight mt-1'>
                {course.title}
              </h1>
            </div>
          </div>

          <div className='flex items-center space-x-3 self-start lg:self-center'>
            <CourseStatusBadge status={course.status} />
            <VisibilityBadge visibility={course.visibility} />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className='flex items-center space-x-2 border-t border-gray-100 mt-6 pt-4'>
          <button
            onClick={() => setActiveTab('curriculum')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === 'curriculum'
                ? 'bg-primary text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Layers className='w-4 h-4' />
            <span>{t('admin.courseForm.tabs.curriculum')} ({formatNumber(modulesCount)})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === 'settings'
                ? 'bg-primary text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Settings className='w-4 h-4' />
            <span>{t('admin.courseForm.tabs.settings')}</span>
          </button>

          <button
            onClick={() => setActiveTab('publishing')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
              activeTab === 'publishing'
                ? 'bg-primary text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Send className='w-4 h-4' />
            <span>{t('admin.courseForm.tabs.publishing')}</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Curriculum Management */}
      {activeTab === 'curriculum' && (
        <div className='space-y-4'>
          <CurriculumManager courseId={course.id} modules={course.modules || []} />
        </div>
      )}

      {/* Tab 2: Settings & Metadata Form */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className='space-y-6'>
          {saveSuccess && (
            <div className='p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center space-x-3 text-sm'>
              <CheckCircle2 className='w-5 h-5 shrink-0 text-emerald-600' />
              <span>{saveSuccess}</span>
            </div>
          )}

          {saveError && (
            <div className='p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center space-x-3 text-sm'>
              <AlertCircle className='w-5 h-5 shrink-0 text-red-500' />
              <div>
                <p className='font-semibold'>{t('admin.courseForm.saveError')}</p>
                <p className='text-xs mt-0.5'>{saveError}</p>
              </div>
            </div>
          )}

          {/* Basic Course Information */}
          <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4'>
            <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
              {t('admin.courseForm.tabs.settings')}
            </h2>

            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.titleLabel')} <span className='text-red-500'>*</span>
              </label>
              <input
                type='text'
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
              {fieldErrors.title && (
                <p className='text-xs text-red-500 mt-1'>{fieldErrors.title.join(', ')}</p>
              )}
            </div>

            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.slugLabel')} <span className='text-red-500'>*</span>
              </label>
              <input
                type='text'
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className='w-full px-3.5 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
              {fieldErrors.slug && (
                <p className='text-xs text-red-500 mt-1'>{fieldErrors.slug.join(', ')}</p>
              )}
            </div>

            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.shortDescLabel')}
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
              <p className='text-[11px] text-gray-400 text-right mt-0.5'>
                {shortDescription.length}/500
              </p>
            </div>

            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.descLabel')}
              </label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
            </div>
          </div>

          {/* Classification & Instructor */}
          <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4'>
            <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
              {t('admin.courses.thCategory')} & {t('admin.courses.thInstructor')}
            </h2>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                  {t('admin.courseForm.categoryLabel')} <span className='text-red-500'>*</span>
                </label>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value=''>{t('admin.courseForm.selectCategory')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {!c.isActive ? `(${t('admin.status.inactive')})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                  {t('admin.courseForm.instructorLabel')}
                </label>
                {isAdmin ? (
                  <select
                    value={instructorId}
                    onChange={(e) => setInstructorId(e.target.value)}
                    className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
                  >
                    {instructors.map((ins) => (
                      <option key={ins.id} value={ins.id}>
                        {ins.name} ({ins.email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className='px-3.5 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 text-gray-700 flex items-center justify-between'>
                    <span className='font-medium'>{course.instructor?.name}</span>
                    <span className='text-xs text-gray-400'>{t('admin.nav.roleInstructor')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pricing & Metadata */}
          <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4'>
            <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
              {t('admin.courses.thPrice')} & {t('admin.courseForm.thumbnailLabel')}
            </h2>

            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>{t('admin.courseForm.priceLabel')}</label>
                <input
                  type='number'
                  step='0.01'
                  min='0'
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>{t('admin.courseForm.currencyLabel')}</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value='BDT'>BDT (৳)</option>
                  <option value='USD'>USD ($)</option>
                </select>
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>{t('admin.courseForm.levelLabel')}</label>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value as CourseLevel)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value='BEGINNER'>{t('admin.courseForm.levelBeginner')}</option>
                  <option value='INTERMEDIATE'>{t('admin.courseForm.levelIntermediate')}</option>
                  <option value='ADVANCED'>{t('admin.courseForm.levelAdvanced')}</option>
                </select>
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>{t('admin.courseForm.languageLabel')}</label>
                <input
                  type='text'
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                  {t('admin.courseForm.durationLabel')}
                </label>
                <input
                  type='number'
                  min='0'
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 0)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                  {t('admin.courseForm.visibilityLabel')}
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as CourseVisibility)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value='PUBLIC'>{t('admin.courseForm.visibilityPublic')}</option>
                  <option value='PRIVATE'>{t('admin.courseForm.visibilityPrivate')}</option>
                </select>
              </div>
            </div>

            {/* Thumbnail */}
            <div className='pt-2'>
              <label className='block text-xs font-semibold text-gray-700 mb-2'>
                {t('admin.courseForm.thumbnailLabel')}
              </label>
              <MediaUploader
                mediaType='IMAGE'
                initialMediaId={thumbnailMediaId}
                initialPublicUrl={thumbnailUrl}
                onUploaded={(asset) => {
                  setThumbnailMediaId(asset.id);
                  setThumbnailUrl(asset.secureUrl);
                }}
                onRemoved={() => {
                  setThumbnailMediaId(null);
                  setThumbnailUrl(null);
                }}
              />
            </div>
          </div>

          <div className='flex items-center justify-end space-x-3'>
            <button
              type='submit'
              disabled={updateMutation.isPending}
              className='inline-flex items-center space-x-2 px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs disabled:opacity-50'
            >
              <Save className='w-4 h-4' />
              <span>{updateMutation.isPending ? t('admin.courseForm.saving') : t('admin.courseForm.saveChanges')}</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 3: Publishing Lifecycle Management */}
      {activeTab === 'publishing' && (
        <div className='space-y-4'>
          <PublishingActions
            course={course}
            isAdmin={isAdmin}
            onStatusChanged={() => {
              refetchCourse();
            }}
          />
        </div>
      )}
    </div>
  );
}
