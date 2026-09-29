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
  const [currency, setCurrency] = useState('USD');
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
      setPrice(course.price !== undefined ? String(course.price) : '0.00');
      setCurrency(course.currency || 'USD');
      setLevel(course.level || 'BEGINNER');
      setLanguage(course.language || 'English');
      setDurationMinutes(course.durationMinutes || 0);
      setVisibility(course.visibility || 'PUBLIC');
      setThumbnailMediaId(course.thumbnailMediaId || null);
      setThumbnailUrl(course.thumbnailUrl || null);
    }
  }, [course]);

  // Update Course Mutation
  const updateMutation = useMutation({
    mutationFn: (payload: UpdateCourseRequest) => updateCourse(courseId, payload),
    onSuccess: (updated) => {
      setSaveError(null);
      setFieldErrors({});
      setSaveSuccess('Course information updated successfully.');
      queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
      setTimeout(() => setSaveSuccess(null), 4000);
    },
    onError: (err: any) => {
      const respData = err?.response?.data;
      setSaveError(respData?.message || err?.message || 'Failed to update course');
      if (respData?.errors && typeof respData.errors === 'object') {
        setFieldErrors(respData.errors);
      }
    },
  });

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(null);
    setSaveError(null);
    setFieldErrors({});

    const payload: UpdateCourseRequest = {
      title: title.trim(),
      slug: slug.trim() || undefined,
      shortDescription: shortDescription.trim() || undefined,
      description: description.trim() || undefined,
      categoryId: categoryId || undefined,
      instructorId: isAdmin && instructorId ? instructorId : undefined,
      price: price || '0.00',
      currency,
      level,
      language,
      durationMinutes: Number(durationMinutes) || 0,
      visibility,
      thumbnailMediaId: thumbnailMediaId || null,
    };

    updateMutation.mutate(payload);
  };

  if (isLoadingCourse) {
    return (
      <div className='p-16 text-center'>
        <Loader2 className='w-8 h-8 text-primary animate-spin mx-auto mb-4' />
        <p className='text-sm text-gray-500'>Loading course details from API...</p>
      </div>
    );
  }

  if (isCourseError || !course) {
    return (
      <div className='max-w-xl mx-auto p-12 bg-white rounded-2xl border border-gray-200 shadow-xs text-center'>
        <AlertCircle className='w-12 h-12 text-red-500 mx-auto mb-4' />
        <h2 className='text-xl font-bold text-gray-900 mb-2'>Course Not Found</h2>
        <p className='text-sm text-gray-600 mb-6'>
          {(courseError as any)?.response?.data?.message ||
            'Unable to load the requested course. It may not exist or you may lack permission to access it.'}
        </p>
        <Link
          href='/admin/courses'
          className='inline-flex items-center space-x-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition'
        >
          <ArrowLeft className='w-4 h-4' />
          <span>Back to Courses</span>
        </Link>
      </div>
    );
  }

  const modulesCount = course.modules?.length || 0;
  const lessonsCount =
    course.modules?.reduce((acc, m) => acc + (m.lessons?.length || 0), 0) || 0;

  return (
    <div className='space-y-6'>
      {/* Top Header Card */}
      <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs'>
        <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4'>
          <div className='space-y-2'>
            <div className='flex items-center space-x-3'>
              <Link
                href='/admin/courses'
                className='p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition'
                title='Back to course list'
              >
                <ArrowLeft className='w-5 h-5' />
              </Link>
              <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight'>
                {course.title}
              </h1>
            </div>

            <div className='flex flex-wrap items-center gap-2.5 text-xs text-gray-500 pl-8'>
              <span className='font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded'>
                /{course.slug}
              </span>
              <span>•</span>
              <span>Category: <strong>{course.category?.name || 'Unassigned'}</strong></span>
              <span>•</span>
              <span>Instructor: <strong>{course.instructor?.name || 'Assigned'}</strong></span>
              <span>•</span>
              <span>{modulesCount} {modulesCount === 1 ? 'Module' : 'Modules'}</span>
              <span>•</span>
              <span>{lessonsCount} {lessonsCount === 1 ? 'Lesson' : 'Lessons'}</span>
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
            <span>Curriculum ({modulesCount} modules)</span>
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
            <span>Course Information & Metadata</span>
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
            <span>Publishing & Status ({course.status})</span>
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
                <p className='font-semibold'>Failed to update course</p>
                <p className='text-xs mt-0.5'>{saveError}</p>
              </div>
            </div>
          )}

          {/* Basic Course Information */}
          <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4'>
            <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
              Course Details
            </h2>

            <div>
              <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                Course Title <span className='text-red-500'>*</span>
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
                URL Slug <span className='text-red-500'>*</span>
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
                Short Summary
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
                Full Description / Syllabus Overview
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
              Classification & Instructor
            </h2>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                  Category <span className='text-red-500'>*</span>
                </label>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value=''>Select a Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {!c.isActive ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>
                  Instructor
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
                    <span className='text-xs text-gray-400'>Instructor (Fixed)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pricing & Metadata */}
          <div className='bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4'>
            <h2 className='text-lg font-semibold text-gray-900 border-b border-gray-100 pb-3'>
              Pricing, Level & Thumbnail
            </h2>

            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>Price</label>
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
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>Currency</label>
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

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>Level</label>
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

              <div>
                <label className='block text-xs font-semibold text-gray-700 mb-1.5'>Language</label>
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
                  Duration (Minutes)
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
                  Visibility
                </label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as CourseVisibility)}
                  className='w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary'
                >
                  <option value='PUBLIC'>Public</option>
                  <option value='PRIVATE'>Private</option>
                </select>
              </div>
            </div>

            {/* Thumbnail */}
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

          <div className='flex items-center justify-end space-x-3'>
            <button
              type='submit'
              disabled={updateMutation.isPending}
              className='inline-flex items-center space-x-2 px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-xs disabled:opacity-50'
            >
              <Save className='w-4 h-4' />
              <span>{updateMutation.isPending ? 'Saving Changes...' : 'Save Settings'}</span>
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
