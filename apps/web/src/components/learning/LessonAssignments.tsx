'use client';

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAssignments,
  submitAssignment,
  fetchSubmissions,
  gradeSubmission,
} from '@/lib/api/assignments';
import { SafeMarkdown } from './SafeMarkdown';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  FileArchive,
  Download,
  Award,
  ChevronRight,
  Loader2,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import type {
  AssignmentDto,
  AssignmentSubmissionDto,
  AssignmentGradeDto,
} from '@techsprout/contracts';

interface LessonAssignmentsProps {
  courseId: string;
  lessonId: string;
  currentUserId?: string;
  isInstructor?: boolean;
  isAdmin?: boolean;
}

export function LessonAssignments({
  courseId,
  lessonId,
  currentUserId,
  isInstructor,
  isAdmin,
}: LessonAssignmentsProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [studentNotes, setStudentNotes] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);

  // Instructor grading state
  const [gradingSubmissionId, setGradingSubmissionId] = useState<string | null>(null);
  const [gradeScore, setGradeScore] = useState<number>(100);
  const [gradeFeedback, setGradeFeedback] = useState<string>('');

  // 1. Fetch assignments for lesson/course
  const {
    data: assignmentsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['assignments', courseId, lessonId],
    queryFn: () => fetchAssignments(courseId, { lessonId, limit: 10 }),
    enabled: !!courseId && !!lessonId,
  });

  const assignmentList = assignmentsData?.data || [];
  const activeAssignment =
    assignmentList.find((a) => a.id === selectedAssignmentId) || assignmentList[0];

  // 2. Fetch instructor submissions if instructor/admin
  const { data: submissionsData, isLoading: isSubmissionsLoading } = useQuery({
    queryKey: ['assignmentSubmissions', courseId, activeAssignment?.id],
    queryFn: () => fetchSubmissions(courseId, activeAssignment!.id, { limit: 50 }),
    enabled: !!activeAssignment && (isInstructor || isAdmin),
  });

  // 3. Submit Assignment Mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!activeAssignment || !selectedFile) return;
      return submitAssignment(courseId, activeAssignment.id, selectedFile, studentNotes);
    },
    onSuccess: () => {
      setSelectedFile(null);
      setStudentNotes('');
      setFileError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['assignments', courseId, lessonId] });
      queryClient.invalidateQueries({ queryKey: ['assignmentSubmissions', courseId, activeAssignment?.id] });
    },
    onError: (err: any) => {
      setFileError(err?.response?.data?.message || 'Submission upload failed. Please try again.');
    },
  });

  // 4. Grade Submission Mutation (Instructor)
  const gradeMutation = useMutation({
    mutationFn: async () => {
      if (!activeAssignment || !gradingSubmissionId) return;
      return gradeSubmission(courseId, activeAssignment.id, gradingSubmissionId, {
        score: Number(gradeScore),
        feedback: gradeFeedback,
      });
    },
    onSuccess: () => {
      setGradingSubmissionId(null);
      setGradeFeedback('');
      queryClient.invalidateQueries({ queryKey: ['assignmentSubmissions', courseId, activeAssignment?.id] });
      queryClient.invalidateQueries({ queryKey: ['assignments', courseId, lessonId] });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side extension validation
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.zip')) {
      setFileError('Invalid file type. Only .pdf and .zip files are allowed.');
      setSelectedFile(null);
      return;
    }

    // Client-side 25MB size limit
    if (file.size > 25 * 1024 * 1024) {
      setFileError('File size exceeds the 25 MB limit.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  return (
    <div className='bg-white rounded-3xl border border-gray-200/80 p-6 sm:p-8 shadow-xs space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between gap-4 pb-4 border-b border-gray-100'>
        <div>
          <div className='flex items-center gap-2'>
            <FileText className='w-5 h-5 text-primary' />
            <h3 className='text-base sm:text-lg font-bold text-gray-900'>Project Assignments</h3>
          </div>
          <p className='text-xs text-gray-500 mt-1'>
            Complete hands-on assignments, submit your code or design archive, and receive structured feedback.
          </p>
        </div>

        {activeAssignment && (
          <div className='flex items-center gap-2'>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                activeAssignment.status === 'PUBLISHED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {activeAssignment.status}
            </span>
          </div>
        )}
      </div>

      {isLoading && (
        <div className='py-12 flex flex-col items-center justify-center space-y-3 text-gray-400'>
          <Loader2 className='w-6 h-6 animate-spin text-primary' />
          <p className='text-xs font-medium'>Loading assignments...</p>
        </div>
      )}

      {isError && (
        <div className='p-6 text-center space-y-3 bg-red-50/50 rounded-2xl border border-red-100'>
          <AlertCircle className='w-6 h-6 text-red-500 mx-auto' />
          <p className='text-xs font-semibold text-red-800'>Failed to load assignments.</p>
          <Button onClick={() => refetch()} variant='outline' size='sm' className='rounded-xl text-xs'>
            Retry
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && assignmentList.length === 0 && (
        <div className='py-12 text-center space-y-3 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200'>
          <BookOpen className='w-8 h-8 text-gray-300 mx-auto' />
          <p className='text-sm font-semibold text-gray-700'>No assignments for this lesson</p>
          <p className='text-xs text-gray-400 max-w-sm mx-auto'>
            There are currently no hands-on project submissions required for this specific lesson.
          </p>
        </div>
      )}

      {/* Main Assignment Content */}
      {activeAssignment && (
        <div className='space-y-6'>
          {/* Assignment Overview Card */}
          <div className='bg-gray-50/80 rounded-2xl border border-gray-200/90 p-5 sm:p-6 space-y-4'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200/60 pb-3'>
              <h4 className='text-base font-bold text-gray-900'>{activeAssignment.title}</h4>
              <div className='flex items-center gap-3 text-xs text-gray-500'>
                <span>Max Score: <strong className='text-gray-900'>{activeAssignment.maxScore} pts</strong></span>
                {activeAssignment.dueDate && (
                  <>
                    <span>•</span>
                    <span className='flex items-center gap-1'>
                      <Clock className='w-3.5 h-3.5' />
                      Due: {new Date(activeAssignment.dueDate).toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
            </div>

            <SafeMarkdown content={activeAssignment.description} className='text-xs sm:text-sm text-gray-700' />

            {/* Detailed Instructions if available */}
            {activeAssignment.instructions && (
              <div className='mt-3 pt-3 border-t border-gray-200/60 space-y-1.5'>
                <span className='text-xs font-bold text-gray-800 uppercase tracking-wider'>Instructions:</span>
                <SafeMarkdown content={activeAssignment.instructions} className='text-xs text-gray-600' />
              </div>
            )}

            {/* Rubric Section */}
            {activeAssignment.rubric && activeAssignment.rubric.length > 0 && (
              <div className='pt-3 border-t border-gray-200/60 space-y-2'>
                <span className='text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5'>
                  <Award className='w-3.5 h-3.5 text-primary' />
                  <span>Grading Rubric</span>
                </span>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-2.5'>
                  {activeAssignment.rubric.map((crit) => (
                    <div key={crit.id} className='bg-white rounded-xl border border-gray-200/80 p-3 text-xs space-y-1'>
                      <div className='flex items-center justify-between font-bold text-gray-900'>
                        <span>{crit.title}</span>
                        <span className='text-primary'>{crit.maxScore} pts</span>
                      </div>
                      {crit.description && <p className='text-gray-500 text-[11px]'>{crit.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Student Submission Card */}
          {(!isInstructor && !isAdmin) && (
            <div className='bg-white rounded-2xl border border-gray-200/90 p-5 sm:p-6 space-y-5'>
              <div className='flex items-center justify-between pb-3 border-b border-gray-100'>
                <div className='flex items-center gap-2'>
                  <FileCheck className='w-4 h-4 text-primary' />
                  <h4 className='text-sm font-bold text-gray-900'>Your Submission</h4>
                </div>
                {activeAssignment.userSubmission && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeAssignment.userSubmission.status === 'GRADED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {activeAssignment.userSubmission.status}
                  </span>
                )}
              </div>

              {/* Existing Submission Details */}
              {activeAssignment.userSubmission ? (
                <div className='space-y-4'>
                  <div className='p-4 rounded-xl bg-gray-50 border border-gray-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs'>
                    <div className='space-y-1'>
                      <div className='flex items-center gap-2 font-bold text-gray-900'>
                        {activeAssignment.userSubmission.mimeType === 'application/pdf' ? (
                          <FileText className='w-4 h-4 text-red-500' />
                        ) : (
                          <FileArchive className='w-4 h-4 text-amber-500' />
                        )}
                        <span>{activeAssignment.userSubmission.originalFilename}</span>
                        <span className='text-gray-400 font-normal'>
                          ({Math.round(activeAssignment.userSubmission.fileSizeBytes / 1024)} KB)
                        </span>
                      </div>
                      <p className='text-gray-500'>
                        Version {activeAssignment.userSubmission.version} • Submitted on{' '}
                        {new Date(activeAssignment.userSubmission.submittedAt).toLocaleString()}
                      </p>
                    </div>

                    <a
                      href={activeAssignment.userSubmission.fileUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs transition-all'
                    >
                      <Download className='w-3.5 h-3.5' />
                      <span>Download Archive</span>
                    </a>
                  </div>

                  {/* Feedback and Grade if Graded */}
                  {activeAssignment.userSubmission.grade && (
                    <div className='p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2'>
                      <div className='flex items-center justify-between'>
                        <span className='text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5'>
                          <CheckCircle2 className='w-4 h-4 text-emerald-600' />
                          <span>Evaluation Result</span>
                        </span>
                        <span className='text-base font-extrabold text-emerald-700'>
                          {activeAssignment.userSubmission.grade.score} / {activeAssignment.maxScore} pts (
                          {activeAssignment.userSubmission.grade.percentage}%)
                        </span>
                      </div>
                      {activeAssignment.userSubmission.grade.feedback && (
                        <div className='text-xs text-emerald-950 pt-1'>
                          <strong>Instructor Feedback:</strong>
                          <p className='mt-1 leading-relaxed'>{activeAssignment.userSubmission.grade.feedback}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeAssignment.allowResubmission && activeAssignment.status === 'PUBLISHED' && (
                    <div className='pt-2 border-t border-gray-100'>
                      <p className='text-xs text-gray-500 mb-3'>
                        Need to update your submission? You can upload a new version below.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Upload Input Area (if not submitted or resubmission allowed) */}
              {(!activeAssignment.userSubmission ||
                (activeAssignment.allowResubmission && activeAssignment.status === 'PUBLISHED')) && (
                <div className='space-y-4 pt-2'>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className='border-2 border-dashed border-gray-200 hover:border-primary/40 rounded-2xl p-6 text-center cursor-pointer transition-all bg-gray-50/50 hover:bg-primary/5 space-y-2'
                  >
                    <Upload className='w-8 h-8 text-gray-400 mx-auto' />
                    <div className='text-xs text-gray-600'>
                      <span className='font-bold text-primary'>Click to upload</span> or drag and drop
                    </div>
                    <p className='text-[11px] text-gray-400'>
                      ZIP or PDF files only (Maximum file size: 25 MB)
                    </p>
                    <input
                      ref={fileInputRef}
                      type='file'
                      accept='.zip,.pdf'
                      onChange={handleFileChange}
                      className='hidden'
                    />
                  </div>

                  {selectedFile && (
                    <div className='p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between text-xs text-purple-900'>
                      <div className='flex items-center gap-2'>
                        <FileCheck className='w-4 h-4 text-primary' />
                        <span className='font-bold'>{selectedFile.name}</span>
                        <span className='text-purple-600'>({Math.round(selectedFile.size / 1024)} KB)</span>
                      </div>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setSelectedFile(null)}
                        className='h-6 px-2 text-xs text-red-600 hover:bg-red-50'
                      >
                        Remove
                      </Button>
                    </div>
                  )}

                  <div className='space-y-1.5'>
                    <label className='text-xs font-semibold text-gray-700'>Notes for Instructor (Optional)</label>
                    <input
                      type='text'
                      value={studentNotes}
                      onChange={(e) => setStudentNotes(e.target.value)}
                      placeholder='e.g., Implemented the extra credit challenge in src/extra.ts'
                      className='w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
                    />
                  </div>

                  {fileError && (
                    <div className='p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2'>
                      <AlertCircle className='w-4 h-4 shrink-0' />
                      <span>{fileError}</span>
                    </div>
                  )}

                  <Button
                    onClick={() => submitMutation.mutate()}
                    disabled={!selectedFile || submitMutation.isPending}
                    className='w-full rounded-xl text-xs font-bold py-2.5 bg-primary text-white hover:bg-primary/90'
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className='w-4 h-4 animate-spin' />
                    ) : (
                      'Submit Assignment'
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Instructor Submissions Review Section */}
          {(isInstructor || isAdmin) && (
            <div className='bg-white rounded-2xl border border-gray-200/90 p-5 sm:p-6 space-y-4'>
              <div className='flex items-center justify-between pb-3 border-b border-gray-100'>
                <div className='flex items-center gap-2'>
                  <Award className='w-4 h-4 text-primary' />
                  <h4 className='text-sm font-bold text-gray-900'>
                    Student Submissions ({submissionsData?.total || 0})
                  </h4>
                </div>
              </div>

              {isSubmissionsLoading ? (
                <div className='py-6 text-center text-xs text-gray-400'>Loading student submissions...</div>
              ) : submissionsData?.data?.length === 0 ? (
                <div className='py-6 text-center text-xs text-gray-400'>
                  No student submissions received for this assignment yet.
                </div>
              ) : (
                <div className='space-y-3'>
                  {submissionsData?.data?.map((sub) => (
                    <div
                      key={sub.id}
                      className='p-4 rounded-xl border border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs'
                    >
                      <div className='space-y-1'>
                        <div className='flex items-center gap-2'>
                          <span className='font-bold text-gray-900'>{sub.studentName}</span>
                          <span className='text-gray-400'>({sub.studentEmail})</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              sub.status === 'GRADED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {sub.status}
                          </span>
                        </div>
                        <div className='text-gray-500 flex items-center gap-2'>
                          <span>Version {sub.version}</span>
                          <span>•</span>
                          <span>{sub.originalFilename}</span>
                          <span>•</span>
                          <span>{new Date(sub.submittedAt).toLocaleString()}</span>
                        </div>
                        {sub.studentNotes && (
                          <p className='text-gray-600 italic text-[11px]'>Note: "{sub.studentNotes}"</p>
                        )}
                        {sub.grade && (
                          <p className='text-emerald-700 font-bold'>
                            Score: {sub.grade.score}/{activeAssignment.maxScore} pts ({sub.grade.percentage}%)
                          </p>
                        )}
                      </div>

                      <div className='flex items-center gap-2'>
                        <a
                          href={sub.fileUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs'
                        >
                          Download
                        </a>
                        <Button
                          size='sm'
                          onClick={() => {
                            setGradingSubmissionId(sub.id);
                            setGradeScore(sub.grade?.score ?? activeAssignment.maxScore);
                            setGradeFeedback(sub.grade?.feedback ?? '');
                          }}
                          className='rounded-lg text-xs font-semibold px-3 py-1.5 bg-primary text-white hover:bg-primary/90'
                        >
                          {sub.status === 'GRADED' ? 'Re-grade' : 'Grade'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Grading Form Modal / Inline Drawer */}
              {gradingSubmissionId && (
                <div className='p-4 rounded-xl border border-primary/30 bg-purple-50/50 space-y-3 mt-4'>
                  <div className='flex items-center justify-between'>
                    <span className='text-xs font-bold text-gray-900 uppercase tracking-wider'>
                      Evaluate Submission
                    </span>
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => setGradingSubmissionId(null)}
                      className='h-6 text-xs'
                    >
                      Cancel
                    </Button>
                  </div>

                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                    <div className='space-y-1'>
                      <label className='text-xs font-semibold text-gray-700'>
                        Numeric Score (Max: {activeAssignment.maxScore})
                      </label>
                      <input
                        type='number'
                        min={0}
                        max={activeAssignment.maxScore}
                        value={gradeScore}
                        onChange={(e) => setGradeScore(Number(e.target.value))}
                        className='w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:border-primary'
                      />
                    </div>
                    <div className='space-y-1 sm:col-span-2'>
                      <label className='text-xs font-semibold text-gray-700'>Written Feedback</label>
                      <textarea
                        rows={3}
                        value={gradeFeedback}
                        onChange={(e) => setGradeFeedback(e.target.value)}
                        placeholder='Great job implementing the requested features...'
                        className='w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs focus:outline-none focus:border-primary'
                      />
                    </div>
                  </div>

                  <div className='flex justify-end'>
                    <Button
                      onClick={() => gradeMutation.mutate()}
                      disabled={gradeMutation.isPending}
                      className='rounded-xl text-xs font-bold px-4 py-2 bg-primary text-white hover:bg-primary/90'
                    >
                      {gradeMutation.isPending ? <Loader2 className='w-4 h-4 animate-spin' /> : 'Save Grade'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
