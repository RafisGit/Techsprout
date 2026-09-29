'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Video,
  FileText,
  FileCheck,
  Eye,
  AlertCircle,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MediaUploader } from './MediaUploader';
import {
  createModule,
  updateModule,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson,
} from '@/lib/api/catalog';
import type { ModuleDto, LessonDto, LessonType } from '@techsprout/contracts';

interface CurriculumManagerProps {
  courseId: string;
  modules: ModuleDto[];
}

export function CurriculumManager({ courseId, modules }: CurriculumManagerProps) {
  const queryClient = useQueryClient();
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Module state
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleDescription, setModuleDescription] = useState('');
  const [modulePosition, setModulePosition] = useState<number>(1);

  // Lesson state
  const [activeModuleForLesson, setActiveModuleForLesson] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [lessonType, setLessonType] = useState<LessonType>('VIDEO');
  const [lessonPosition, setLessonPosition] = useState<number>(1);
  const [lessonDuration, setLessonDuration] = useState<number>(0);
  const [lessonIsPreview, setLessonIsPreview] = useState(false);
  const [lessonMediaId, setLessonMediaId] = useState<string | null>(null);
  const [lessonMediaUrl, setLessonMediaUrl] = useState<string | null>(null);
  const [lessonContent, setLessonContent] = useState('');

  const toggleExpand = (modId: string) => {
    setExpandedModules((prev) => ({
      ...prev,
      [modId]: prev[modId] === undefined ? true : !prev[modId],
    }));
  };

  const invalidateCourse = () => {
    queryClient.invalidateQueries({ queryKey: ['adminCourse', courseId] });
  };

  // --- Module Mutations ---
  const createModMutation = useMutation({
    mutationFn: () =>
      createModule(courseId, {
        title: moduleTitle,
        description: moduleDescription || null,
        position: modulePosition,
      }),
    onSuccess: () => {
      setErrorMessage(null);
      setIsAddingModule(false);
      setModuleTitle('');
      setModuleDescription('');
      invalidateCourse();
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.message || 'Failed to create module');
    },
  });

  const updateModMutation = useMutation({
    mutationFn: (modId: string) =>
      updateModule(modId, {
        title: moduleTitle,
        description: moduleDescription || null,
        position: modulePosition,
      }),
    onSuccess: () => {
      setErrorMessage(null);
      setEditingModuleId(null);
      invalidateCourse();
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.message || 'Failed to update module');
    },
  });

  const deleteModMutation = useMutation({
    mutationFn: (modId: string) => deleteModule(modId),
    onSuccess: () => {
      setErrorMessage(null);
      invalidateCourse();
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.message || 'Failed to delete module');
    },
  });

  // --- Lesson Mutations ---
  const createLesMutation = useMutation({
    mutationFn: (modId: string) =>
      createLesson(modId, {
        title: lessonTitle,
        description: lessonDescription || null,
        lessonType,
        position: lessonPosition,
        durationSeconds: lessonDuration,
        isPreview: lessonIsPreview,
        mediaId: lessonMediaId || null,
        content: lessonContent || null,
      }),
    onSuccess: () => {
      setErrorMessage(null);
      setActiveModuleForLesson(null);
      resetLessonForm();
      invalidateCourse();
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.message || 'Failed to create lesson');
    },
  });

  const updateLesMutation = useMutation({
    mutationFn: (lesId: string) =>
      updateLesson(lesId, {
        title: lessonTitle,
        description: lessonDescription || null,
        lessonType,
        position: lessonPosition,
        durationSeconds: lessonDuration,
        isPreview: lessonIsPreview,
        mediaId: lessonMediaId || null,
        content: lessonContent || null,
      }),
    onSuccess: () => {
      setErrorMessage(null);
      setEditingLessonId(null);
      resetLessonForm();
      invalidateCourse();
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.message || 'Failed to update lesson');
    },
  });

  const deleteLesMutation = useMutation({
    mutationFn: (lesId: string) => deleteLesson(lesId),
    onSuccess: () => {
      setErrorMessage(null);
      invalidateCourse();
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.message || 'Failed to delete lesson');
    },
  });

  const resetLessonForm = () => {
    setLessonTitle('');
    setLessonDescription('');
    setLessonType('VIDEO');
    setLessonPosition(1);
    setLessonDuration(0);
    setLessonIsPreview(false);
    setLessonMediaId(null);
    setLessonMediaUrl(null);
    setLessonContent('');
  };

  const handleStartAddLesson = (mod: ModuleDto) => {
    resetLessonForm();
    const nextPos = (mod.lessons?.length || 0) + 1;
    setLessonPosition(nextPos);
    setActiveModuleForLesson(mod.id);
    setEditingLessonId(null);
    setErrorMessage(null);
  };

  const handleStartEditLesson = (les: LessonDto) => {
    setLessonTitle(les.title);
    setLessonDescription(les.description || '');
    setLessonType(les.lessonType);
    setLessonPosition(les.position);
    setLessonDuration(les.durationSeconds || 0);
    setLessonIsPreview(les.isPreview || false);
    setLessonMediaId(les.mediaId || null);
    setLessonMediaUrl(les.mediaUrl || null);
    setLessonContent(les.content || '');
    setEditingLessonId(les.id);
    setActiveModuleForLesson(les.moduleId);
    setErrorMessage(null);
  };

  const sortedModules = [...(modules || [])].sort((a, b) => a.position - b.position);

  return (
    <div className='p-6 bg-white rounded-xl shadow-xs border border-gray-200'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-gray-100 gap-4'>
        <div>
          <h3 className='text-lg font-bold text-gray-900'>Curriculum: Modules & Lessons</h3>
          <p className='text-xs text-gray-500 mt-0.5'>
            Structure course curriculum into ordered learning modules and sequenced lessons.
          </p>
        </div>
        <Button
          type='button'
          onClick={() => {
            setIsAddingModule(true);
            setModuleTitle('');
            setModuleDescription('');
            setModulePosition(sortedModules.length + 1);
            setErrorMessage(null);
          }}
          className='bg-primary text-white text-xs h-9'
        >
          <Plus className='w-4 h-4 mr-1.5' />
          Add Module
        </Button>
      </div>

      {errorMessage && (
        <div className='mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2'>
          <AlertCircle className='w-4 h-4 flex-shrink-0' />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Add Module Inline Form */}
      {isAddingModule && (
        <div className='mt-4 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3'>
          <h4 className='text-sm font-semibold text-primary'>New Curriculum Module</h4>
          <div className='grid grid-cols-1 sm:grid-cols-4 gap-3'>
            <div className='sm:col-span-3'>
              <Input
                placeholder='Module Title (e.g. Module 1: Foundations)'
                value={moduleTitle}
                onChange={(e) => setModuleTitle(e.target.value)}
                className='h-9 bg-white text-sm'
              />
            </div>
            <div>
              <Input
                type='number'
                min={1}
                placeholder='Position'
                value={modulePosition}
                onChange={(e) => setModulePosition(parseInt(e.target.value, 10) || 1)}
                className='h-9 bg-white text-sm'
              />
            </div>
          </div>
          <Textarea
            placeholder='Module overview or description (optional)'
            value={moduleDescription}
            onChange={(e) => setModuleDescription(e.target.value)}
            className='bg-white text-sm resize-none h-16'
          />
          <div className='flex justify-end space-x-2 pt-1'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setIsAddingModule(false)}
              className='text-xs h-8'
            >
              Cancel
            </Button>
            <Button
              type='button'
              size='sm'
              onClick={() => createModMutation.mutate()}
              disabled={!moduleTitle.trim() || createModMutation.isPending}
              className='bg-primary text-white text-xs h-8'
            >
              {createModMutation.isPending && <Loader2 className='w-3 h-3 mr-1 animate-spin' />}
              Save Module
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {sortedModules.length === 0 && !isAddingModule && (
        <div className='py-12 text-center'>
          <div className='p-3 bg-gray-50 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-gray-400 mb-3'>
            <Plus className='w-6 h-6' />
          </div>
          <h4 className='text-sm font-semibold text-gray-700'>No curriculum modules yet</h4>
          <p className='text-xs text-gray-400 mt-1 max-w-sm mx-auto'>
            Publishing requires at least 1 module with lessons. Click Add Module to begin structuring this course.
          </p>
        </div>
      )}

      {/* Modules List */}
      <div className='mt-6 space-y-4'>
        {sortedModules.map((mod) => {
          const isExpanded = expandedModules[mod.id] !== false; // default open
          const isEditingThisMod = editingModuleId === mod.id;
          const sortedLessons = [...(mod.lessons || [])].sort((a, b) => a.position - b.position);

          return (
            <div key={mod.id} className='border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs'>
              {/* Module Header */}
              {isEditingThisMod ? (
                <div className='p-4 bg-gray-50 border-b border-gray-200 space-y-3'>
                  <div className='flex items-center space-x-2'>
                    <Input
                      value={moduleTitle}
                      onChange={(e) => setModuleTitle(e.target.value)}
                      className='bg-white h-8 text-sm flex-1'
                    />
                    <Input
                      type='number'
                      min={1}
                      value={modulePosition}
                      onChange={(e) => setModulePosition(parseInt(e.target.value, 10) || 1)}
                      className='bg-white h-8 w-20 text-sm'
                    />
                    <Button
                      size='sm'
                      onClick={() => updateModMutation.mutate(mod.id)}
                      disabled={updateModMutation.isPending}
                      className='bg-emerald-600 text-white h-8 text-xs'
                    >
                      <Check className='w-3.5 h-3.5 mr-1' />
                      Save
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setEditingModuleId(null)}
                      className='h-8 text-xs'
                    >
                      <X className='w-3.5 h-3.5' />
                    </Button>
                  </div>
                  <Textarea
                    value={moduleDescription}
                    onChange={(e) => setModuleDescription(e.target.value)}
                    placeholder='Module description'
                    className='bg-white text-xs h-14 resize-none'
                  />
                </div>
              ) : (
                <div className='p-4 bg-gray-50/70 border-b border-gray-200 flex items-center justify-between'>
                  <div className='flex items-center space-x-3 cursor-pointer' onClick={() => toggleExpand(mod.id)}>
                    <button type='button' className='text-gray-400 hover:text-gray-600'>
                      {isExpanded ? <ChevronUp className='w-4 h-4' /> : <ChevronDown className='w-4 h-4' />}
                    </button>
                    <div>
                      <div className='flex items-center space-x-2'>
                        <span className='px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 text-gray-700'>
                          #{mod.position}
                        </span>
                        <h4 className='text-sm font-semibold text-gray-800'>{mod.title}</h4>
                      </div>
                      {mod.description && <p className='text-xs text-gray-500 mt-0.5'>{mod.description}</p>}
                    </div>
                  </div>

                  <div className='flex items-center space-x-1.5'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => handleStartAddLesson(mod)}
                      className='text-xs text-primary hover:text-primary hover:bg-primary/10 h-7'
                    >
                      <Plus className='w-3.5 h-3.5 mr-1' />
                      Add Lesson
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        setEditingModuleId(mod.id);
                        setModuleTitle(mod.title);
                        setModuleDescription(mod.description || '');
                        setModulePosition(mod.position);
                      }}
                      className='text-xs text-gray-500 hover:text-gray-700 h-7'
                    >
                      <Edit2 className='w-3.5 h-3.5' />
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete module "${mod.title}" and all its lessons?`)) {
                          deleteModMutation.mutate(mod.id);
                        }
                      }}
                      disabled={deleteModMutation.isPending}
                      className='text-xs text-red-500 hover:text-red-700 hover:bg-red-50 h-7'
                    >
                      <Trash2 className='w-3.5 h-3.5' />
                    </Button>
                  </div>
                </div>
              )}

              {/* Module Content / Lessons List */}
              {isExpanded && (
                <div className='p-4 space-y-3 bg-white'>
                  {/* Inline Add / Edit Lesson Form */}
                  {activeModuleForLesson === mod.id && (
                    <div className='p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3'>
                      <div className='flex items-center justify-between'>
                        <h5 className='text-xs font-bold text-primary uppercase tracking-wider'>
                          {editingLessonId ? 'Edit Lesson' : 'New Lesson'}
                        </h5>
                        <button
                          type='button'
                          onClick={() => {
                            setActiveModuleForLesson(null);
                            setEditingLessonId(null);
                          }}
                          className='text-gray-400 hover:text-gray-600'
                        >
                          <X className='w-4 h-4' />
                        </button>
                      </div>

                      <div className='grid grid-cols-1 sm:grid-cols-4 gap-3'>
                        <div className='sm:col-span-2'>
                          <label className='block text-xs font-medium text-gray-700 mb-1'>Title</label>
                          <Input
                            placeholder='e.g. Lesson 1.1: Setup Environment'
                            value={lessonTitle}
                            onChange={(e) => setLessonTitle(e.target.value)}
                            className='h-8 bg-white text-xs'
                          />
                        </div>
                        <div>
                          <label className='block text-xs font-medium text-gray-700 mb-1'>Lesson Type</label>
                          <select
                            value={lessonType}
                            onChange={(e) => setLessonType(e.target.value as LessonType)}
                            className='w-full h-8 px-2 text-xs rounded-md border border-gray-300 bg-white'
                          >
                            <option value='VIDEO'>VIDEO</option>
                            <option value='TEXT'>TEXT</option>
                            <option value='PDF'>PDF</option>
                          </select>
                        </div>
                        <div>
                          <label className='block text-xs font-medium text-gray-700 mb-1'>Position</label>
                          <Input
                            type='number'
                            min={1}
                            value={lessonPosition}
                            onChange={(e) => setLessonPosition(parseInt(e.target.value, 10) || 1)}
                            className='h-8 bg-white text-xs'
                          />
                        </div>
                      </div>

                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                        <div>
                          <label className='block text-xs font-medium text-gray-700 mb-1'>
                            Duration (Seconds)
                          </label>
                          <Input
                            type='number'
                            min={0}
                            placeholder='e.g. 480'
                            value={lessonDuration}
                            onChange={(e) => setLessonDuration(parseInt(e.target.value, 10) || 0)}
                            className='h-8 bg-white text-xs'
                          />
                        </div>
                        <div className='flex items-center space-x-2 pt-6'>
                          <input
                            type='checkbox'
                            id={`preview-${mod.id}`}
                            checked={lessonIsPreview}
                            onChange={(e) => setLessonIsPreview(e.target.checked)}
                            className='rounded border-gray-300 text-primary focus:ring-primary w-4 h-4'
                          />
                          <label htmlFor={`preview-${mod.id}`} className='text-xs font-medium text-gray-700'>
                            Free Public Preview Lesson
                          </label>
                        </div>
                      </div>

                      {/* Content or Media attachment based on type */}
                      {lessonType === 'VIDEO' && (
                        <div>
                          <MediaUploader
                            type='video'
                            folder='techsprout/videos/lessons'
                            currentUrl={lessonMediaUrl}
                            currentMediaId={lessonMediaId}
                            onMediaSelect={(m) => {
                              setLessonMediaId(m?.id || null);
                              setLessonMediaUrl(m?.url || null);
                            }}
                            label='Attach Video Asset (Required for Course Publishing)'
                          />
                        </div>
                      )}

                      {lessonType === 'TEXT' && (
                        <div>
                          <label className='block text-xs font-medium text-gray-700 mb-1'>
                            Reading Lesson Content (Markdown supported)
                          </label>
                          <Textarea
                            placeholder='Write your lesson notes, guidelines, or transcript here...'
                            value={lessonContent}
                            onChange={(e) => setLessonContent(e.target.value)}
                            className='bg-white text-xs h-24 resize-none'
                          />
                        </div>
                      )}

                      <div className='flex justify-end space-x-2 pt-2 border-t border-gray-200'>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            setActiveModuleForLesson(null);
                            setEditingLessonId(null);
                          }}
                          className='text-xs h-8'
                        >
                          Cancel
                        </Button>
                        <Button
                          type='button'
                          size='sm'
                          onClick={() => {
                            if (editingLessonId) {
                              updateLesMutation.mutate(editingLessonId);
                            } else {
                              createLesMutation.mutate(mod.id);
                            }
                          }}
                          disabled={!lessonTitle.trim() || createLesMutation.isPending || updateLesMutation.isPending}
                          className='bg-primary text-white text-xs h-8'
                        >
                          {(createLesMutation.isPending || updateLesMutation.isPending) && (
                            <Loader2 className='w-3 h-3 mr-1 animate-spin' />
                          )}
                          {editingLessonId ? 'Save Changes' : 'Create Lesson'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Lessons Listing */}
                  {sortedLessons.length === 0 ? (
                    <p className='text-xs text-gray-400 italic py-2 pl-2'>
                      No lessons in this module. Click Add Lesson above.
                    </p>
                  ) : (
                    <div className='divide-y divide-gray-100 rounded-lg border border-gray-100 overflow-hidden'>
                      {sortedLessons.map((les) => (
                        <div
                          key={les.id}
                          className='p-3 flex items-center justify-between hover:bg-gray-50 transition-colors'
                        >
                          <div className='flex items-center space-x-3 truncate'>
                            <span className='text-xs font-bold text-gray-400 w-5'>#{les.position}</span>
                            <div className='p-1.5 rounded-md bg-gray-100 text-gray-600'>
                              {les.lessonType === 'VIDEO' ? (
                                <Video className='w-3.5 h-3.5 text-blue-600' />
                              ) : les.lessonType === 'TEXT' ? (
                                <FileText className='w-3.5 h-3.5 text-amber-600' />
                              ) : (
                                <FileCheck className='w-3.5 h-3.5 text-emerald-600' />
                              )}
                            </div>
                            <div className='truncate'>
                              <div className='flex items-center space-x-2'>
                                <p className='text-xs font-semibold text-gray-800 truncate'>{les.title}</p>
                                {les.isPreview && (
                                  <span className='inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800'>
                                    <Eye className='w-2.5 h-2.5 mr-0.5' />
                                    Preview
                                  </span>
                                )}
                              </div>
                              <p className='text-[10px] text-gray-400'>
                                {les.lessonType} • {Math.round(les.durationSeconds / 60)} min •{' '}
                                {les.mediaId ? (
                                  <span className='text-emerald-600'>Media attached</span>
                                ) : les.lessonType === 'VIDEO' ? (
                                  <span className='text-amber-600 font-semibold'>Missing media</span>
                                ) : (
                                  'Text content'
                                )}
                              </p>
                            </div>
                          </div>

                          <div className='flex items-center space-x-1'>
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              onClick={() => handleStartEditLesson(les)}
                              className='text-xs text-gray-500 hover:text-gray-800 h-6 px-2'
                            >
                              <Edit2 className='w-3 h-3' />
                            </Button>
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              onClick={() => {
                                if (confirm(`Delete lesson "${les.title}"?`)) {
                                  deleteLesMutation.mutate(les.id);
                                }
                              }}
                              className='text-xs text-red-500 hover:text-red-700 h-6 px-2'
                            >
                              <Trash2 className='w-3 h-3' />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
