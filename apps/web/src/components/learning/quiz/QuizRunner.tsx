'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  HelpCircle,
  Loader2,
  Send,
  AlertCircle,
  Check,
} from 'lucide-react';
import type {
  StudentActiveAttemptDto,
  StudentQuizDto,
  StudentAnswerItem,
  StudentQuizQuestionDto,
} from '@techsprout/contracts';
import { QuizTimer } from './QuizTimer';
import { saveAttemptAnswers } from '@/lib/api/quizzes';

interface QuizRunnerProps {
  quiz: StudentQuizDto;
  attempt: StudentActiveAttemptDto;
  onSubmitted: (answers: StudentAnswerItem[]) => Promise<void>;
  isSubmitting?: boolean;
}

export function QuizRunner({
  quiz,
  attempt,
  onSubmitted,
  isSubmitting = false,
}: QuizRunnerProps) {
  const questions = attempt.questions || [];
  const [currentIdx, setCurrentIdx] = useState(0);

  // Local answer state: questionId -> selectedOptionIds[]
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const ans of attempt.savedAnswers || []) {
      initial[ans.questionId] = ans.selectedOptionIds;
    }
    return initial;
  });

  // Autosave status: 'saved' | 'saving' | 'error'
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Refs to track latest answers and versioning for race-free debounced autosave
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const dirtyVersionRef = useRef(0);
  const savedVersionRef = useRef(0);

  // Autosave execution
  const executeSave = useCallback(async () => {
    const versionToSave = dirtyVersionRef.current;
    if (versionToSave === savedVersionRef.current) return;

    const currentAnswers = answersRef.current;
    const formattedAnswers: StudentAnswerItem[] = Object.entries(currentAnswers).map(
      ([questionId, selectedOptionIds]) => ({
        questionId,
        selectedOptionIds,
      })
    );

    if (formattedAnswers.length === 0) {
      savedVersionRef.current = versionToSave;
      setSaveStatus('saved');
      return;
    }

    try {
      setSaveStatus('saving');
      await saveAttemptAnswers(quiz.id, attempt.id, formattedAnswers);
      if (versionToSave > savedVersionRef.current) {
        savedVersionRef.current = versionToSave;
      }
      if (dirtyVersionRef.current === versionToSave) {
        setSaveStatus('saved');
      }
    } catch {
      setSaveStatus('error');
    }
  }, [quiz.id, attempt.id]);

  // Debounce autosave on answer changes
  useEffect(() => {
    if (dirtyVersionRef.current === savedVersionRef.current) return;

    const timer = setTimeout(() => {
      executeSave();
    }, 800);

    return () => clearTimeout(timer);
  }, [answers, executeSave]);

  // Handle Option Selection
  const handleSelectOption = (question: StudentQuizQuestionDto, optionId: string) => {
    if (isSubmitting) return;

    const currentSelected = answers[question.id] || [];

    if (question.questionType === 'MULTIPLE_CHOICE') {
      const isAlreadySelected = currentSelected.includes(optionId);
      const nextSelected = isAlreadySelected
        ? currentSelected.filter((id) => id !== optionId)
        : [...currentSelected, optionId];

      dirtyVersionRef.current += 1;
      setAnswers((prev) => ({ ...prev, [question.id]: nextSelected }));
    } else {
      // SINGLE_CHOICE or TRUE_FALSE
      dirtyVersionRef.current += 1;
      setAnswers((prev) => ({ ...prev, [question.id]: [optionId] }));
    }
  };

  // Submission handler
  const handleSubmit = async () => {
    if (isSubmitting) return;

    // Flush any pending unsaved answers before submit
    const currentAnswers = answersRef.current;
    const formattedAnswers: StudentAnswerItem[] = Object.entries(currentAnswers).map(
      ([questionId, selectedOptionIds]) => ({
        questionId,
        selectedOptionIds,
      })
    );

    await onSubmitted(formattedAnswers);
  };

  // Timer expiration auto-submission
  const handleTimerExpired = useCallback(() => {
    if (!isSubmitting) {
      handleSubmit();
    }
  }, [isSubmitting]);

  const currentQuestion = questions[currentIdx];
  const selectedForCurrent = (currentQuestion ? answers[currentQuestion.id] : []) || [];

  const answeredCount = questions.filter(
    (q) => (answers[q.id] || []).length > 0
  ).length;
  const unansweredCount = questions.length - answeredCount;

  if (!currentQuestion) {
    return (
      <div className='p-8 text-center text-sm text-gray-500'>
        No questions found for this assessment.
      </div>
    );
  }

  return (
    <div
      className='bg-white border border-gray-200/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs'
      data-testid='quiz-runner'
    >
      {/* Top Runner Bar: Attempt Header, Progress & Timer */}
      <div className='flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100'>
        <div className='space-y-1'>
          <div className='flex items-center gap-2'>
            <span className='text-xs font-bold text-gray-900'>
              Attempt #{attempt.attemptNumber}
            </span>
            <span className='text-gray-300'>•</span>
            <span className='text-xs font-medium text-gray-500'>
              Question {currentIdx + 1} of {questions.length}
            </span>
          </div>

          {/* Autosave subtle status indicator */}
          <div className='flex items-center gap-1.5 text-[11px] text-gray-400' data-testid='autosave-status'>
            {saveStatus === 'saving' ? (
              <>
                <Loader2 className='w-3 h-3 animate-spin text-primary' />
                <span>Saving answers...</span>
              </>
            ) : saveStatus === 'error' ? (
              <span className='text-amber-600'>Changes not saved. Retrying soon...</span>
            ) : (
              <>
                <Check className='w-3 h-3 text-emerald-500' />
                <span>All answers saved</span>
              </>
            )}
          </div>
        </div>

        {/* Timer (if timed) */}
        {attempt.expiresAt && (
          <QuizTimer
            expiresAt={attempt.expiresAt}
            onExpire={handleTimerExpired}
            isSubmitting={isSubmitting}
          />
        )}
      </div>

      {/* Question Palette / Fast Jump Navigation */}
      <div className='flex flex-wrap items-center gap-1.5 py-1' data-testid='question-palette'>
        {questions.map((q, idx) => {
          const isAnswered = (answers[q.id] || []).length > 0;
          const isCurrent = idx === currentIdx;

          return (
            <button
              key={q.id}
              type='button'
              onClick={() => setCurrentIdx(idx)}
              disabled={isSubmitting}
              data-testid={`question-jump-${idx + 1}`}
              aria-label={`Jump to question ${idx + 1}, ${isAnswered ? 'answered' : 'unanswered'}`}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-xs font-bold transition flex items-center justify-center ${
                isCurrent
                  ? 'bg-primary text-white shadow-xs ring-2 ring-primary/30 ring-offset-1'
                  : isAnswered
                  ? 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'
                  : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* Active Question Box */}
      <div className='space-y-4 pt-2' data-testid={`question-box-${currentQuestion.id}`}>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-xs font-bold uppercase tracking-wider text-primary'>
            Question {currentIdx + 1}
          </span>
          <span className='text-xs font-semibold text-gray-500'>
            {currentQuestion.points} {currentQuestion.points === 1 ? 'point' : 'points'}
          </span>
        </div>

        {/* Question Text */}
        <h2 className='text-base sm:text-lg font-bold text-gray-900 leading-snug' data-testid='question-text'>
          {currentQuestion.questionText}
        </h2>

        {/* Question Subtitle / Type Hint */}
        <p className='text-xs text-gray-400'>
          {currentQuestion.questionType === 'MULTIPLE_CHOICE'
            ? 'Select all options that apply.'
            : currentQuestion.questionType === 'TRUE_FALSE'
            ? 'Select True or False.'
            : 'Select one option.'}
        </p>

        {/* Options List */}
        <fieldset className='space-y-2.5 pt-2'>
          <legend className='sr-only'>{currentQuestion.questionText}</legend>
          {currentQuestion.options.map((option) => {
            const isSelected = selectedForCurrent.includes(option.id);
            const isMultiple = currentQuestion.questionType === 'MULTIPLE_CHOICE';

            return (
              <label
                key={option.id}
                data-testid={`option-${option.id}`}
                className={`flex items-start gap-3 p-4 rounded-2xl border transition cursor-pointer select-none ${
                  isSelected
                    ? 'border-primary bg-primary/5 text-gray-900 shadow-2xs ring-1 ring-primary/20'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/60 text-gray-700'
                } ${isSubmitting ? 'pointer-events-none opacity-60' : ''}`}
              >
                <input
                  type={isMultiple ? 'checkbox' : 'radio'}
                  name={`question-${currentQuestion.id}`}
                  value={option.id}
                  checked={isSelected}
                  onChange={() => handleSelectOption(currentQuestion, option.id)}
                  disabled={isSubmitting}
                  className='sr-only'
                />

                {/* Custom Accessible Checkbox / Radio Circle */}
                <div
                  className={`w-5 h-5 rounded-${
                    isMultiple ? 'md' : 'full'
                  } border flex items-center justify-center shrink-0 mt-0.5 transition ${
                    isSelected
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-300 bg-white'
                  }`}
                  aria-hidden='true'
                >
                  {isSelected && (
                    isMultiple ? (
                      <Check className='w-3 h-3 stroke-[3]' />
                    ) : (
                      <div className='w-2 h-2 rounded-full bg-white' />
                    )
                  )}
                </div>

                <span className='text-xs sm:text-sm font-medium leading-relaxed'>
                  {option.optionText}
                </span>
              </label>
            );
          })}
        </fieldset>
      </div>

      {/* Navigation & Submit Controls */}
      <div className='pt-6 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3'>
        {/* Previous Question Button */}
        <Button
          type='button'
          variant='outline'
          onClick={() => setCurrentIdx((prev) => Math.max(0, prev - 1))}
          disabled={currentIdx === 0 || isSubmitting}
          className='rounded-xl text-xs font-semibold px-4 py-2 border-gray-200 hover:bg-gray-50'
          data-testid='btn-prev-question'
        >
          <ArrowLeft className='w-4 h-4 mr-1.5' />
          Previous
        </Button>

        {/* Progress Summary in Center */}
        <span className='text-xs text-gray-500 hidden sm:inline-block'>
          {answeredCount} of {questions.length} answered
        </span>

        {/* Next Question or Submit Trigger */}
        {currentIdx < questions.length - 1 ? (
          <Button
            type='button'
            onClick={() => setCurrentIdx((prev) => Math.min(questions.length - 1, prev + 1))}
            disabled={isSubmitting}
            className='rounded-xl text-xs font-bold px-5 py-2 bg-primary text-white hover:bg-primary/90'
            data-testid='btn-next-question'
          >
            Next
            <ArrowRight className='w-4 h-4 ml-1.5' />
          </Button>
        ) : (
          <Button
            type='button'
            onClick={() => setShowSubmitConfirm(true)}
            disabled={isSubmitting}
            className='rounded-xl text-xs font-bold px-5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
            data-testid='btn-submit-quiz'
          >
            <Send className='w-4 h-4 mr-1.5' />
            Finish & Submit
          </Button>
        )}
      </div>

      {/* Submit Confirmation Modal / Prompt */}
      {showSubmitConfirm && (
        <div
          className='fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4'
          data-testid='modal-submit-confirm'
        >
          <div className='bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-gray-100 shadow-xl space-y-4 animate-in fade-in zoom-in-95'>
            <div className='flex items-center gap-3'>
              <div className='w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0'>
                <Send className='w-5 h-5' />
              </div>
              <div>
                <h3 className='text-base font-bold text-gray-900'>Submit Assessment</h3>
                <p className='text-xs text-gray-500'>
                  Are you ready to submit your attempt for grading?
                </p>
              </div>
            </div>

            {unansweredCount > 0 ? (
              <div className='p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5'>
                <AlertCircle className='w-4 h-4 text-amber-600 shrink-0 mt-0.5' />
                <div>
                  <span className='font-bold'>Incomplete Questions: </span>
                  You have <span className='font-bold'>{unansweredCount}</span> unanswered{' '}
                  {unansweredCount === 1 ? 'question' : 'questions'}. You may still submit, but unanswered questions
                  receive 0 points.
                </div>
              </div>
            ) : (
              <p className='text-xs text-gray-600'>
                You have answered all {questions.length} questions. Your answers will be authoritatively graded by the server.
              </p>
            )}

            <div className='flex justify-end gap-2.5 pt-2'>
              <Button
                type='button'
                variant='outline'
                disabled={isSubmitting}
                onClick={() => setShowSubmitConfirm(false)}
                className='rounded-xl text-xs font-semibold px-4 py-2 border-gray-200'
              >
                Continue Answering
              </Button>
              <Button
                type='button'
                disabled={isSubmitting}
                onClick={() => {
                  setShowSubmitConfirm(false);
                  handleSubmit();
                }}
                className='rounded-xl text-xs font-bold px-5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                data-testid='btn-confirm-submit'
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className='w-4 h-4 mr-1.5 animate-spin' />
                    Submitting...
                  </>
                ) : (
                  'Confirm & Submit'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
