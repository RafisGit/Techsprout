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

  // Form states
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [price, setPrice] = useState('0.00');
  const [currency, setCurrency] = useState('USD');
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

  // Auto-slug generator on title change
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isSlugCustomized) {
      setSlug(slugify(val));
    }
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateCourseRequest) => createCourse(payload),
    onSuccess: (newCourse) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
      router.push(`/admin/courses/${newCourse.id}`);
    },
    onError: (err: any) => {
      const respData = err?.response?.data;
      setFormError(respData?.message || err?.message || 'Failed to create course');
      if (respData?.errors && typeof respData.errors === 'object') {
        setFieldErrors(respData.errors);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (!title.trim() || title.length < 3) {
      setFormError('Course title must be at least 3 characters.');
      return;
    }

    if (!categoryId) {
      setFormError('Please select a course category.');
      return;
    }

    const payload: CreateCourseRequest = {
      title: title.trim(),
      slug: slug.trim() ? slugify(slug) : undefined,
      shortDescription: shortDescription.trim() || undefined,
      description: description.trim() || undefined,
      categoryId,
      instructorId: isAdmin && instructorId ? instructorId : undefined,
      price: price || '0.00',
      currency,
      level,
      language,
      durationMinutes: Number(durationMinutes) || 0,
      visibility,
      thumbnailMediaId: thumbnailMediaId || null,
    };

    createMutation.mutate(payload);
  };

  return (
    <div className='max-w-4xl mx-auto space-y-6'>
      {/* Header and Back Link */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center space-x-3'>
          <Link
            href='/admin/courses'
            className='p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition'
          >
            <ArrowLeft className='w-5 h-5' />
          </Link>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>Create New Course</h1>
            <p className='text-xs text-gray-500 mt-0.5'>
              Add a new course to the institutional catalog. Initial state will be{' '}
              <strong className='text-amber-600'>DRAFT</strong>.
            </p>
          </div>
        </div>
      </div>

      {formError && (
        <div className='p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center space-x-3 text-sm'>
          <AlertCircle className='w-5 h-5 shrink-0 text-red-500' />
          <div>
            <p className='font-semibold'>Error creating course</p>
            <p className='text-xs mt-0.5'>{formError}</p>
          </div>
        </div>
      )}

      {/* Main Creation Form */}
      <form onSubmit={handleSubmit} className='space-y-6'>
        {/* Basic Course Information */}
        <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5'>
          <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
            Basic Information
          </h2>

          <div className='space-y-4'>
            {/* Title */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                Course Title <span className='text-red-500'>*</span>
              </label>
              <input
                type='text'
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder='e.g. Modern Full-Stack Development with Next.js'
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
              {fieldErrors.title && (
                <p className='text-xs text-red-500 mt-1'>{fieldErrors.title.join(', ')}</p>
              )}
            </div>

            {/* Slug */}
            <div>
              <div className='flex items-center justify-between mb-1.5'>
                <label className='block text-xs font-semibold text-gray-700'>
                  URL Slug <span className='text-red-500'>*</span>
                </label>
                {!isSlugCustomized && (
                  <span className='text-[11px] text-primary flex items-center space-x-1'>
                    <Sparkles className='w-3 h-3' />
                    <span>Auto-generated from title</span>
                  </span>
                )}
              </div>
              <div className='flex rounded-xl shadow-xs'>
                <span className='inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-xs font-mono'>
                  /courses/
                </span>
                <input
                  type='text'
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setIsSlugCustomized(true);
                  }}
                  placeholder='modern-full-stack-development'
                  className='flex-1 min-w-0 block w-full px-3.5 py-2 rounded-none rounded-r-xl border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary'
                />
              </div>
              {fieldErrors.slug && (
                <p className='text-xs text-red-500 mt-1'>{fieldErrors.slug.join(', ')}</p>
              )}
            </div>

            {/* Short Description */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                Short Summary
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder='A concise 1-2 sentence overview of what students will achieve...'
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
              <p className='text-[11px] text-gray-400 text-right mt-0.5'>
                {shortDescription.length}/500
              </p>
            </div>

            {/* Detailed Description */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                Full Description / Syllabus Overview
              </label>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='Detailed description, prerequisites, and learning outcomes...'
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary'
              />
            </div>
          </div>
        </div>

        {/* Classification & Ownership */}
        <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5'>
          <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
            Classification & Instructor
          </h2>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {/* Category */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                Category <span className='text-red-500'>*</span>
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={isLoadingCategories}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50'
              >
                <option value=''>Select a Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {!c.isActive ? '(Inactive)' : ''}
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
                Assigned Instructor
              </label>
              {isAdmin ? (
                <select
                  value={instructorId}
                  onChange={(e) => setInstructorId(e.target.value)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value=''>Assign to Self ({currentUser?.name})</option>
                  {instructors.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.name} ({ins.email})
                    </option>
                  ))}
                </select>
              ) : (
                <div className='px-3.5 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 text-gray-700 flex items-center justify-between'>
                  <span className='font-medium'>{currentUser?.name} (You)</span>
                  <span className='text-xs text-gray-400 font-mono'>Instructor</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pricing, Level & Media */}
        <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-5'>
          <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
            Pricing, Metadata & Thumbnail
          </h2>

          <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
            {/* Price */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                Price (0 for Free)
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
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
              >
                <option value='USD'>USD ($)</option>
                <option value='EUR'>EUR (€)</option>
                <option value='GBP'>GBP (£)</option>
                <option value='BDT'>BDT (৳)</option>
              </select>
            </div>

            {/* Level */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                Level
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as CourseLevel)}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
              >
                <option value='BEGINNER'>Beginner</option>
                <option value='INTERMEDIATE'>Intermediate</option>
                <option value='ADVANCED'>Advanced</option>
                <option value='ALL_LEVELS'>All Levels</option>
              </select>
            </div>

            {/* Language */}
            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                Language
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
                Estimated Duration (Minutes)
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
                Visibility
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as CourseVisibility)}
                className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
              >
                <option value='PUBLIC'>Public (Listed in catalog when published)</option>
                <option value='PRIVATE'>Private (Unlisted)</option>
              </select>
            </div>
          </div>

          {/* Thumbnail Uploader */}
          <div className='pt-2'>
            <label className='block text-xs font-semibold text-gray-700 mb-2'>
              Course Cover Thumbnail
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
            Cancel
          </Link>
          <button
            type='submit'
            disabled={createMutation.isPending}
            className='inline-flex items-center space-x-2 px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs disabled:opacity-50'
          >
            <Save className='w-4 h-4' />
            <span>{createMutation.isPending ? 'Creating Draft...' : 'Create Course'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
