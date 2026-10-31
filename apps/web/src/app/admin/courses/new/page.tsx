'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createCourse,
  fetchAdminCategories,
  fetchAdminUsers,
} from '@/lib/api/catalog';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { MediaUploader } from '@/components/admin/MediaUploader';
import { useTranslation } from '@/i18n/client';
import { ArrowLeft, Save, AlertCircle, Sparkles } from 'lucide-react';
import type {
  CourseLevel,
  CourseVisibility,
  CreateCourseRequest,
} from '@techsprout/contracts';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function NewCoursePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const { t } = useTranslation();

  // Form states
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
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

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Query categories
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
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

  // Auto-slugify title
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isSlugCustomized) {
      setSlug(slugify(val));
    }
  };

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreateCourseRequest) => createCourse(payload),
    onSuccess: (newCourse) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
      router.push(`/admin/courses/${newCourse.id}`);
    },
    onError: (err: any) => {
      const resp = err?.response?.data;
      if (resp?.errors) {
        setFieldErrors(resp.errors);
      }
      setFormError(resp?.message || err?.message || t('admin.courseForm.saveError'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (!title.trim() || title.length < 3) {
      setFormError(t('admin.courseForm.titleLabel'));
      return;
    }
    if (!categoryId) {
      setFormError(t('admin.courseForm.selectCategory'));
      return;
    }

    const payload: CreateCourseRequest = {
      title: title.trim(),
      slug: slug.trim() ? slugify(slug) : undefined,
      shortDescription: shortDescription.trim() || undefined,
      description: description.trim() || undefined,
      categoryId,
      instructorId: isAdmin && instructorId ? instructorId : undefined,
      price: parseFloat(price) || 0,
      currency,
      level,
      language: language.trim() || 'English',
      durationMinutes: durationMinutes || undefined,
      visibility,
      thumbnailMediaId: thumbnailMediaId || undefined,
    };

    createMutation.mutate(payload);
  };

  return (
    <div className='max-w-4xl mx-auto space-y-6 pb-12'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center space-x-3'>
          <Link
            href='/admin/courses'
            className='p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition'
            title={t('admin.courseForm.backToCourses')}
          >
            <ArrowLeft className='w-4 h-4' />
          </Link>
          <div>
            <h1 className='text-2xl font-bold text-gray-900 tracking-tight'>
              {t('admin.courseForm.createTitle')}
            </h1>
            <p className='text-xs text-gray-500 mt-0.5'>
              {t('admin.courseForm.createSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {formError && (
        <div className='p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center space-x-3 text-sm'>
          <AlertCircle className='w-5 h-5 shrink-0 text-red-500' />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className='space-y-6'>
        {/* Core Metadata */}
        <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5'>
          <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
            {t('admin.courseForm.tabs.settings')}
          </h2>

          <div className='space-y-4'>
            {/* Title */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.titleLabel')} <span className='text-red-500'>*</span>
              </label>
              <input
                type='text'
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder={t('admin.courseForm.titlePlaceholder')}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
              {fieldErrors.title && (
                <p className='text-xs text-red-500 mt-1'>{fieldErrors.title.join(', ')}</p>
              )}
            </div>

            {/* Slug */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.slugLabel')} <span className='text-red-500'>*</span>
              </label>
              <div className='flex rounded-xl shadow-xs'>
                <span className='inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-xs font-mono'>
                  /courses/
                </span>
                <input
                  type='text'
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setIsSlugCustomized(true);
                  }}
                  placeholder={t('admin.courseForm.slugPlaceholder')}
                  className='flex-1 block w-full px-3.5 py-2 rounded-none rounded-r-xl border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>
            </div>

            {/* Short Description */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.shortDescLabel')}
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder={t('admin.courseForm.shortDescPlaceholder')}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
              <p className='text-[11px] text-gray-400 text-right mt-0.5'>
                {shortDescription.length}/500
              </p>
            </div>

            {/* Detailed Description */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.descLabel')}
              </label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('admin.courseForm.descPlaceholder')}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
            </div>
          </div>
        </div>

        {/* Classification & Ownership */}
        <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5'>
          <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
            {t('admin.courses.thCategory')} & {t('admin.courses.thInstructor')}
          </h2>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {/* Category */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.categoryLabel')} <span className='text-red-500'>*</span>
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={isLoadingCategories}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50'
              >
                <option value=''>{t('admin.courseForm.selectCategory')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {!c.isActive ? `(${t('admin.status.inactive')})` : ''}
                  </option>
                ))}
              </select>
              {fieldErrors.categoryId && (
                <p className='text-xs text-red-500 mt-1'>{fieldErrors.categoryId.join(', ')}</p>
              )}
            </div>

            {/* Instructor */}
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
                  <option value=''>{t('admin.courseForm.selectInstructor')} ({currentUser?.name})</option>
                  {instructors.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.name} ({ins.email})
                    </option>
                  ))}
                </select>
              ) : (
                <div className='px-3.5 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 text-gray-700 flex items-center justify-between'>
                  <span className='font-medium'>{currentUser?.name}</span>
                  <span className='text-xs text-gray-400 font-mono'>{t('admin.nav.roleInstructor')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pricing, Level & Media */}
        <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5'>
          <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
            {t('admin.courses.thPrice')} & {t('admin.courseForm.thumbnailLabel')}
          </h2>

          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
            {/* Price */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.priceLabel')}
              </label>
              <input
                type='number'
                step='0.01'
                min='0'
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
            </div>

            {/* Currency */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.currencyLabel')}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
              >
                <option value='BDT'>BDT (৳)</option>
                <option value='USD'>USD ($)</option>
              </select>
            </div>

            {/* Level */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.levelLabel')}
              </label>
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

            {/* Language */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                {t('admin.courseForm.languageLabel')}
              </label>
              <input
                type='text'
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
            </div>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            {/* Duration */}
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

            {/* Visibility */}
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

          {/* Thumbnail Uploader */}
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

        {/* Submit Actions */}
        <div className='flex items-center justify-end space-x-3 pt-4'>
          <Link
            href='/admin/courses'
            className='px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition'
          >
            {t('admin.courseForm.cancel')}
          </Link>
          <button
            type='submit'
            disabled={createMutation.isPending}
            className='inline-flex items-center space-x-2 px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs disabled:opacity-50'
          >
            <Save className='w-4 h-4' />
            <span>{createMutation.isPending ? t('admin.courseForm.saving') : t('admin.courseForm.createCourse')}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
