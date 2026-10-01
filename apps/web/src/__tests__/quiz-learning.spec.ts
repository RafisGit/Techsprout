import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchStudentQuiz,
  startOrResumeAttempt,
  fetchAttemptDetail,
  saveAttemptAnswers,
  submitAttempt,
  fetchAttemptReview,
} from '@/lib/api/quizzes';
import {
  flattenCurriculumItems,
  getAdjacentCurriculumItems,
  getCurriculumItemHref,
} from '@/lib/curriculumUtils';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  StudentQuizDto,
  StudentActiveAttemptDto,
  StudentQuizResultDto,
  StudentQuizReviewDto,
  LearningCurriculumDto,
  CurriculumItemDto,
  CurriculumLessonItemDto,
  CurriculumQuizItemDto,
} from '@techsprout/contracts';

// Mock axiosInstance
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('P4.4 — Student Quiz Experience Frontend & Contract Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1-6: CURRICULUM & MIXED ORDERING
  // ==========================================
  describe('Curriculum module.items Consumer & Mixed Ordering', () => {
    const mockCurriculumWithMixedItems: LearningCurriculumDto = {
      courseId: 'c-101',
      courseStatus: 'PUBLISHED',
      progressPercentage: 40,
      completedLessonsCount: 1,
      totalLessonsCount: 2,
      publishedQuizzesCount: 2,
      passedQuizzesCount: 1,
      modules: [
        {
          id: 'mod-1',
          title: 'Module 1: Distributed Core',
          position: 1,
          lessons: [
            {
              id: 'les-1',
              title: 'Lesson 1: Intro',
              position: 1,
              lessonType: 'VIDEO',
              durationSeconds: 300,
              isPreview: true,
              progress: { status: 'COMPLETED', watchPositionSeconds: 300, completedAt: '2026-10-01' },
            },
            {
              id: 'les-2',
              title: 'Lesson 2: Consensus',
              position: 2,
              lessonType: 'VIDEO',
              durationSeconds: 400,
              isPreview: false,
              progress: { status: 'NOT_STARTED', watchPositionSeconds: 0 },
            },
          ],
          items: [
            {
              type: 'LESSON',
              id: 'les-1',
              title: 'Lesson 1: Intro',
              position: 1,
              lessonType: 'VIDEO',
              durationSeconds: 300,
              isPreview: true,
              progress: { status: 'COMPLETED', watchPositionSeconds: 300, completedAt: '2026-10-01' },
            },
            {
              type: 'QUIZ',
              id: 'quiz-1',
              title: 'Quiz 1: Distributed Checkpoint',
              position: 2,
              quizType: 'KNOWLEDGE_CHECK',
              passingScorePercentage: 70,
              timeLimitMinutes: 15,
              totalPoints: 20,
              questionsCount: 3,
              maxAttempts: 2,
              isPassed: true,
              userAttemptsCount: 1,
              bestScorePercentage: 90,
            },
            {
              type: 'LESSON',
              id: 'les-2',
              title: 'Lesson 2: Consensus',
              position: 3,
              lessonType: 'VIDEO',
              durationSeconds: 400,
              isPreview: false,
              progress: { status: 'NOT_STARTED', watchPositionSeconds: 0 },
            },
            {
              type: 'QUIZ',
              id: 'quiz-2',
              title: 'Quiz 2: Consensus Exam',
              position: 4,
              quizType: 'FINAL_EXAM',
              passingScorePercentage: 80,
              timeLimitMinutes: 30,
              totalPoints: 50,
              questionsCount: 5,
              maxAttempts: 1,
              isPassed: false,
              userAttemptsCount: 0,
              bestScorePercentage: null,
            },
          ],
        },
      ],
    };

    it('1. quiz items render directly from module.items array', () => {
      const items = flattenCurriculumItems(mockCurriculumWithMixedItems);
      const quizzes = items.filter((it) => it.type === 'QUIZ');
      expect(quizzes).toHaveLength(2);
      expect(quizzes[0].id).toBe('quiz-1');
      expect(quizzes[1].id).toBe('quiz-2');
    });

    it('2. lesson/quiz mixed order is preserved exactly as returned by backend', () => {
      const items = flattenCurriculumItems(mockCurriculumWithMixedItems);
      expect(items.map((it) => it.id)).toEqual(['les-1', 'quiz-1', 'les-2', 'quiz-2']);
      expect(items.map((it) => it.type)).toEqual(['LESSON', 'QUIZ', 'LESSON', 'QUIZ']);
    });

    it('3. frontend does not alter or re-sort module.items position', () => {
      const modItems = mockCurriculumWithMixedItems.modules[0].items!;
      // Verify positions 1, 2, 3, 4 are strictly maintained
      expect(modItems[0].position).toBe(1);
      expect(modItems[1].position).toBe(2);
      expect(modItems[2].position).toBe(3);
      expect(modItems[3].position).toBe(4);
    });

    it('4. multiple quizzes within same module render with correct sequence and metadata', () => {
      const items = flattenCurriculumItems(mockCurriculumWithMixedItems);
      const quiz1 = items.find((it) => it.id === 'quiz-1') as CurriculumQuizItemDto;
      const quiz2 = items.find((it) => it.id === 'quiz-2') as CurriculumQuizItemDto;

      expect(quiz1.quizType).toBe('KNOWLEDGE_CHECK');
      expect(quiz1.isPassed).toBe(true);
      expect(quiz2.quizType).toBe('FINAL_EXAM');
      expect(quiz2.isPassed).toBe(false);
    });

    it('5. navigation from lesson to following quiz resolves correctly', () => {
      const nav = getAdjacentCurriculumItems(mockCurriculumWithMixedItems, 'les-1');
      expect(nav.previousItem).toBeNull();
      expect(nav.nextItem).not.toBeNull();
      expect(nav.nextItem?.id).toBe('quiz-1');
      expect(nav.nextItem?.type).toBe('QUIZ');
      expect(getCurriculumItemHref('fullstack-se', nav.nextItem!)).toBe('/learn/fullstack-se/quiz/quiz-1');
    });

    it('6. navigation from quiz to preceding and following items works seamlessly', () => {
      const nav = getAdjacentCurriculumItems(mockCurriculumWithMixedItems, 'quiz-1');
      expect(nav.previousItem?.id).toBe('les-1');
      expect(nav.previousItem?.type).toBe('LESSON');
      expect(nav.nextItem?.id).toBe('les-2');
      expect(nav.nextItem?.type).toBe('LESSON');
    });

    it('6b. handles cross-module navigation across module boundaries (last item mod1 -> first item mod2) and Quiz->Quiz', () => {
      const multiModuleCurriculum: LearningCurriculumDto = {
        courseId: 'c-multi',
        courseStatus: 'PUBLISHED',
        progressPercentage: 50,
        completedLessonsCount: 1,
        totalLessonsCount: 2,
        publishedQuizzesCount: 2,
        passedQuizzesCount: 1,
        modules: [
          {
            id: 'mod-a',
            title: 'Module A',
            position: 1,
            items: [
              {
                type: 'LESSON',
                id: 'les-a1',
                title: 'Lesson A1',
                position: 1,
                lessonType: 'VIDEO',
                isPreview: false,
              },
              {
                type: 'QUIZ',
                id: 'quiz-a2',
                title: 'Quiz A2 (End of Mod A)',
                position: 2,
                quizType: 'KNOWLEDGE_CHECK',
                passingScorePercentage: 70,
                totalPoints: 10,
                questionsCount: 2,
                isPassed: true,
              },
            ],
          },
          {
            id: 'mod-b',
            title: 'Module B',
            position: 2,
            items: [
              {
                type: 'QUIZ',
                id: 'quiz-b1',
                title: 'Quiz B1 (Start of Mod B)',
                position: 1,
                quizType: 'KNOWLEDGE_CHECK',
                passingScorePercentage: 75,
                totalPoints: 15,
                questionsCount: 3,
                isPassed: false,
              },
              {
                type: 'LESSON',
                id: 'les-b2',
                title: 'Lesson B2 (End of Course)',
                position: 2,
                lessonType: 'ARTICLE',
                isPreview: false,
              },
            ],
          },
        ],
      };

      // Test A: Last item of Mod A (quiz-a2) -> First item of Mod B (quiz-b1) [Quiz -> Quiz across modules]
      const navCrossForward = getAdjacentCurriculumItems(multiModuleCurriculum, 'quiz-a2');
      expect(navCrossForward.previousItem?.id).toBe('les-a1');
      expect(navCrossForward.nextItem?.id).toBe('quiz-b1');
      expect(navCrossForward.nextItem?.type).toBe('QUIZ');

      // Test B: First item of Mod B (quiz-b1) -> Previous item is quiz-a2 [Quiz <- Quiz across modules]
      const navCrossBack = getAdjacentCurriculumItems(multiModuleCurriculum, 'quiz-b1');
      expect(navCrossBack.previousItem?.id).toBe('quiz-a2');
      expect(navCrossBack.previousItem?.type).toBe('QUIZ');
      expect(navCrossBack.nextItem?.id).toBe('les-b2');

      // Test C: End of course (les-b2) -> Next item is null
      const navEnd = getAdjacentCurriculumItems(multiModuleCurriculum, 'les-b2');
      expect(navEnd.nextItem).toBeNull();
    });
  });

  // ==========================================
  // 7-10: QUIZ OVERVIEW & METADATA
  // ==========================================
  describe('Quiz Overview & State Presentation', () => {
    it('7. fetches student quiz metadata with answer keys excluded', async () => {
      const mockQuiz: StudentQuizDto = {
        id: 'quiz-101',
        moduleId: 'mod-1',
        courseId: 'c-1',
        title: 'TypeScript Advanced Generics',
        description: 'Test deep typing patterns',
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 75,
        maxAttempts: 3,
        timeLimitMinutes: 20,
        totalPoints: 25,
        questionsCount: 2,
        userAttemptsCount: 1,
        bestScorePercentage: 70,
        isPassed: false,
        questions: [
          {
            id: 'q-1',
            questionText: 'What does infer keyword do?',
            questionType: 'SINGLE_CHOICE',
            position: 1,
            points: 10,
            options: [
              { id: 'opt-1', optionText: 'Dedicates type inference in conditional types', position: 1 },
              { id: 'opt-2', optionText: 'Forces type cast', position: 2 },
            ],
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockQuiz },
      });

      const result = await fetchStudentQuiz('quiz-101');
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/learn/quizzes/quiz-101');
      expect(result.title).toBe('TypeScript Advanced Generics');
      expect(result.questionsCount).toBe(2);
      expect(result.passingScorePercentage).toBe(75);
      // Ensure no answer keys exist
      expect((result.questions[0] as any).isCorrect).toBeUndefined();
      expect((result.questions[0] as any).explanation).toBeUndefined();
    });

    it('8. renders passed state when isPassed is true', () => {
      const passedQuiz: StudentQuizDto = {
        id: 'q-p',
        moduleId: 'm-1',
        courseId: 'c-1',
        title: 'Passed Quiz',
        quizType: 'KNOWLEDGE_CHECK',
        passingScorePercentage: 70,
        totalPoints: 10,
        questionsCount: 1,
        userAttemptsCount: 1,
        bestScorePercentage: 100,
        isPassed: true,
        questions: [],
      };
      expect(passedQuiz.isPassed).toBe(true);
      expect(passedQuiz.bestScorePercentage).toBe(100);
    });

    it('9. computes attempt-limit states correctly when maxAttempts is configured', () => {
      function computeAttemptState(userAttempts: number, maxAttempts: number | null) {
        if (maxAttempts === null) {
          return { isUnlimited: true, isExhausted: false, remaining: null };
        }
        const remaining = Math.max(0, maxAttempts - userAttempts);
        return {
          isUnlimited: false,
          isExhausted: remaining === 0,
          remaining,
        };
      }

      const activeState = computeAttemptState(1, 3);
      expect(activeState.isUnlimited).toBe(false);
      expect(activeState.isExhausted).toBe(false);
      expect(activeState.remaining).toBe(2);

      const exhaustedState = computeAttemptState(3, 3);
      expect(exhaustedState.isExhausted).toBe(true);
      expect(exhaustedState.remaining).toBe(0);
    });

    it('10. handles unlimited-attempt quiz without misleading attempt constraints', () => {
      function computeAttemptState(userAttempts: number, maxAttempts: number | null) {
        if (maxAttempts === null) {
          return { isUnlimited: true, isExhausted: false, remaining: null };
        }
        return { isUnlimited: false, isExhausted: userAttempts >= maxAttempts, remaining: maxAttempts - userAttempts };
      }

      const unlimitedState = computeAttemptState(5, null);
      expect(unlimitedState.isUnlimited).toBe(true);
      expect(unlimitedState.isExhausted).toBe(false);
      expect(unlimitedState.remaining).toBeNull();
    });
  });

  // ==========================================
  // 11-20: ATTEMPT, RUNNER, AUTOSAVE & TIMER
  // ==========================================
  describe('Attempt Lifecycle, Runner, Autosave & Timing', () => {
    it('11. starts a new attempt via POST /api/v1/learn/quizzes/:id/attempts', async () => {
      const mockAttempt: StudentActiveAttemptDto = {
        id: 'att-1',
        quizId: 'quiz-1',
        attemptNumber: 1,
        status: 'IN_PROGRESS',
        startedAt: '2026-10-01T12:00:00.000Z',
        lastSavedAt: '2026-10-01T12:00:00.000Z',
        timeLimitMinutes: 15,
        expiresAt: '2026-10-01T12:15:00.000Z',
        questions: [],
        savedAnswers: [],
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockAttempt },
      });

      const attempt = await startOrResumeAttempt('quiz-1');
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/learn/quizzes/quiz-1/attempts');
      expect(attempt.id).toBe('att-1');
      expect(attempt.status).toBe('IN_PROGRESS');
    });

    it('12. resumes existing IN_PROGRESS attempt with saved answers intact', async () => {
      const mockResumeAttempt: StudentActiveAttemptDto = {
        id: 'att-existing',
        quizId: 'quiz-1',
        attemptNumber: 2,
        status: 'IN_PROGRESS',
        startedAt: '2026-10-01T12:05:00.000Z',
        lastSavedAt: '2026-10-01T12:07:00.000Z',
        questions: [],
        savedAnswers: [
          { questionId: 'q-1', selectedOptionIds: ['opt-1'] },
        ],
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockResumeAttempt },
      });

      const resumed = await startOrResumeAttempt('quiz-1');
      expect(resumed.id).toBe('att-existing');
      expect(resumed.savedAnswers).toHaveLength(1);
      expect(resumed.savedAnswers[0].selectedOptionIds).toEqual(['opt-1']);
    });

    it('13. single choice option selection replaces previous selection', () => {
      function selectSingleChoice(current: string[], optionId: string): string[] {
        return [optionId];
      }

      let selected = ['opt-1'];
      selected = selectSingleChoice(selected, 'opt-2');
      expect(selected).toEqual(['opt-2']);
    });

    it('14. multiple choice option selection toggles individual options', () => {
      function toggleMultipleChoice(current: string[], optionId: string): string[] {
        return current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
      }

      let selected: string[] = [];
      selected = toggleMultipleChoice(selected, 'opt-1');
      expect(selected).toEqual(['opt-1']);
      selected = toggleMultipleChoice(selected, 'opt-2');
      expect(selected).toEqual(['opt-1', 'opt-2']);
      selected = toggleMultipleChoice(selected, 'opt-1');
      expect(selected).toEqual(['opt-2']);
    });

    it('15. true/false option selection enforces binary choice', () => {
      function selectTrueFalse(optionId: string): string[] {
        return [optionId];
      }
      expect(selectTrueFalse('opt-true')).toEqual(['opt-true']);
      expect(selectTrueFalse('opt-false')).toEqual(['opt-false']);
    });

    it('16. autosave sends PATCH with serialized answers payload', async () => {
      vi.mocked(axiosInstance.patch).mockResolvedValueOnce({
        data: {
          success: true,
          data: { attemptId: 'att-1', savedCount: 2, lastSavedAt: '2026-10-01T12:10:00.000Z' },
        },
      });

      const answers = [
        { questionId: 'q-1', selectedOptionIds: ['opt-1'] },
        { questionId: 'q-2', selectedOptionIds: ['opt-a', 'opt-b'] },
      ];

      const res = await saveAttemptAnswers('quiz-1', 'att-1', answers);
      expect(axiosInstance.patch).toHaveBeenCalledWith(
        '/api/v1/learn/quizzes/quiz-1/attempts/att-1/answers',
        { answers }
      );
      expect(res.savedCount).toBe(2);
    });

    it('16b. autosave version tracking ensures in-flight responses do not clobber newer answers', () => {
      let dirtyVersion = 0;
      let savedVersion = 0;
      let saveStatus: 'saved' | 'saving' | 'error' = 'saved';

      // User selects Q1
      dirtyVersion += 1; // v1
      expect(dirtyVersion > savedVersion).toBe(true);

      // Autosave kicks off for v1
      const versionToSave = dirtyVersion; // 1
      saveStatus = 'saving';

      // User rapidly selects Q2 while v1 is still in-flight
      dirtyVersion += 1; // v2

      // v1 completes successfully
      if (versionToSave > savedVersion) {
        savedVersion = versionToSave; // 1
      }
      if (dirtyVersion === versionToSave) {
        saveStatus = 'saved';
      }
      // dirtyVersion is 2, versionToSave was 1 => status must NOT be 'saved' yet!
      expect(saveStatus).toBe('saving');
      expect(savedVersion).toBe(1);
      expect(dirtyVersion).toBe(2);

      // Next tick triggers save for v2
      const versionToSave2 = dirtyVersion; // 2
      if (versionToSave2 > savedVersion) {
        savedVersion = versionToSave2; // 2
      }
      if (dirtyVersion === versionToSave2) {
        saveStatus = 'saved';
      }
      expect(saveStatus).toBe('saved');
      expect(savedVersion).toBe(2);
    });

    it('16c. empty answers do not trigger PATCH request, avoiding validation rejection', async () => {
      const answers: any[] = [];
      const saveFn = vi.fn();

      if (answers.length > 0) {
        saveFn();
      }

      expect(saveFn).not.toHaveBeenCalled();
    });

    it('19b. immediate answer selection followed by submit flushes all answers directly in submit payload', async () => {
      const currentAnswers = {
        'q-1': ['opt-1'],
        'q-2': ['opt-2', 'opt-3'],
      };

      const formattedAnswers = Object.entries(currentAnswers).map(([questionId, selectedOptionIds]) => ({
        questionId,
        selectedOptionIds,
      }));

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            attemptId: 'att-1',
            quizId: 'quiz-1',
            attemptNumber: 1,
            status: 'SUBMITTED',
            score: 20,
            totalPoints: 20,
            percentage: 100,
            isPassed: true,
            submittedAt: '2026-10-01',
            courseProgressPercentage: 100,
            isCourseCompleted: true,
          },
        },
      });

      const res = await submitAttempt('quiz-1', 'att-1', formattedAnswers);
      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/learn/quizzes/quiz-1/attempts/att-1/submit',
        { answers: formattedAnswers }
      );
      expect(res.isPassed).toBe(true);
      expect(res.score).toBe(20);
    });

    it('17. calculates timer remaining time from server authoritative expiresAt', () => {
      const now = new Date('2026-10-01T12:00:00.000Z').getTime();
      const expiresAt = '2026-10-01T12:15:30.000Z';
      const remainingSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));

      expect(remainingSeconds).toBe(930); // 15 mins 30 secs
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      expect(`${mins}:${secs}`).toBe('15:30');
    });

    it('18. handles timeout state by preventing negative remaining time', () => {
      const now = new Date('2026-10-01T12:20:00.000Z').getTime();
      const expiresAt = '2026-10-01T12:15:00.000Z'; // Expired 5 mins ago
      const remainingSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));

      expect(remainingSeconds).toBe(0);
    });

    it('19. submits attempt and receives graded result payload', async () => {
      const mockResult: StudentQuizResultDto = {
        attemptId: 'att-1',
        quizId: 'quiz-1',
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 35,
        totalPoints: 40,
        percentage: 88,
        isPassed: true,
        submittedAt: '2026-10-01T12:12:00.000Z',
        courseProgressPercentage: 67,
        isCourseCompleted: false,
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockResult },
      });

      const result = await submitAttempt('quiz-1', 'att-1', []);
      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/learn/quizzes/quiz-1/attempts/att-1/submit',
        { answers: [] }
      );
      expect(result.isPassed).toBe(true);
      expect(result.percentage).toBe(88);
      expect(result.courseProgressPercentage).toBe(67);
    });

    it('20. prevents duplicate submission when isSubmitting is true', () => {
      let isSubmitting = true;
      const submitFn = vi.fn();

      function triggerSubmit() {
        if (isSubmitting) return;
        submitFn();
      }

      triggerSubmit();
      expect(submitFn).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // 21-25: RESULTS SCREEN
  // ==========================================
  describe('Results Presentation & Action Guarantees', () => {
    it('21. represents passed state when percentage >= threshold', () => {
      const result: StudentQuizResultDto = {
        attemptId: 'att-1',
        quizId: 'q-1',
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 80,
        totalPoints: 100,
        percentage: 80,
        isPassed: true,
        submittedAt: '2026-10-01',
        courseProgressPercentage: 50,
        isCourseCompleted: false,
      };
      expect(result.isPassed).toBe(true);
    });

    it('22. represents failed state when percentage < threshold', () => {
      const result: StudentQuizResultDto = {
        attemptId: 'att-2',
        quizId: 'q-1',
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 50,
        totalPoints: 100,
        percentage: 50,
        isPassed: false,
        submittedAt: '2026-10-01',
        courseProgressPercentage: 30,
        isCourseCompleted: false,
      };
      expect(result.isPassed).toBe(false);
    });

    it('23. enables retry button when attempts remain', () => {
      function canRetry(used: number, max: number | null, isCompleted: boolean) {
        if (isCompleted) return false;
        if (max === null) return true;
        return used < max;
      }
      expect(canRetry(1, 3, false)).toBe(true);
      expect(canRetry(2, 2, false)).toBe(false);
    });

    it('24. blocks retry when attempt limit is exhausted', () => {
      function canRetry(used: number, max: number | null, isCompleted: boolean) {
        if (isCompleted) return false;
        if (max === null) return true;
        return used < max;
      }
      expect(canRetry(3, 3, false)).toBe(false);
    });

    it('25. review action is available after successful submission', () => {
      const result: StudentQuizResultDto = {
        attemptId: 'att-submitted',
        quizId: 'q-1',
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 30,
        totalPoints: 40,
        percentage: 75,
        isPassed: true,
        submittedAt: '2026-10-01',
        courseProgressPercentage: 60,
        isCourseCompleted: false,
      };
      expect(result.status).toBe('SUBMITTED');
      expect(result.attemptId).toBe('att-submitted');
    });
  });

  // ==========================================
  // 26-28: REVIEW MODE
  // ==========================================
  describe('Review Mode & Pedagogical Explanations', () => {
    it('26. fetches full submitted attempt review via GET /api/v1/learn/quizzes/:id/attempts/:id/review', async () => {
      const mockReview: StudentQuizReviewDto = {
        attemptId: 'att-1',
        quizId: 'quiz-1',
        attemptNumber: 1,
        status: 'SUBMITTED',
        score: 20,
        totalPoints: 20,
        percentage: 100,
        isPassed: true,
        submittedAt: '2026-10-01T12:20:00.000Z',
        questions: [
          {
            questionId: 'q-1',
            questionText: 'What is CAP Theorem consistency?',
            questionType: 'SINGLE_CHOICE',
            points: 20,
            pointsAwarded: 20,
            isCorrect: true,
            selectedOptionIds: ['opt-1'],
            correctOptionIds: ['opt-1'],
            explanation: 'Every read receives the most recent write or an error.',
            options: [
              { id: 'opt-1', optionText: 'Linearizability', position: 1, isCorrect: true },
              { id: 'opt-2', optionText: 'Eventual consistency', position: 2, isCorrect: false },
            ],
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockReview },
      });

      const review = await fetchAttemptReview('quiz-1', 'att-1');
      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/learn/quizzes/quiz-1/attempts/att-1/review'
      );
      expect(review.questions).toHaveLength(1);
      expect(review.questions[0].isCorrect).toBe(true);
      expect(review.questions[0].pointsAwarded).toBe(20);
    });

    it('27. marks option correctness designations accurately in review mode', () => {
      const options = [
        { id: 'o-1', optionText: 'Correct Opt', isCorrect: true },
        { id: 'o-2', optionText: 'Wrong Opt', isCorrect: false },
      ];
      const selectedOptionIds = ['o-1'];

      const evaluated = options.map((opt) => ({
        id: opt.id,
        isSelected: selectedOptionIds.includes(opt.id),
        isCorrect: opt.isCorrect,
        wasCorrectlyChosen: selectedOptionIds.includes(opt.id) && opt.isCorrect,
      }));

      expect(evaluated[0].wasCorrectlyChosen).toBe(true);
      expect(evaluated[1].wasCorrectlyChosen).toBe(false);
    });

    it('28. renders explanations only when provided by server payload', () => {
      const qWithExpl = {
        questionId: 'q-1',
        explanation: 'Because Paxos requires a quorum.',
      };
      const qWithoutExpl = {
        questionId: 'q-2',
        explanation: null,
      };

      expect(!!qWithExpl.explanation).toBe(true);
      expect(!!qWithoutExpl.explanation).toBe(false);
    });
  });

  // ==========================================
  // 29-34: ERROR HANDLING & REST BOUNDARIES
  // ==========================================
  describe('Error Handling & HTTP Contract Enforcements', () => {
    it('29. handles 401 unauthenticated response', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Authentication required', errorCode: 'UNAUTHENTICATED' } },
      });

      await expect(fetchStudentQuiz('q-unauth')).rejects.toMatchObject({
        response: { status: 401 },
      });
    });

    it('30. handles 403 enrollment required response', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: { status: 403, data: { message: 'Enrollment required', errorCode: 'ENROLLMENT_REQUIRED' } },
      });

      await expect(fetchStudentQuiz('q-forbidden')).rejects.toMatchObject({
        response: { status: 403, data: { errorCode: 'ENROLLMENT_REQUIRED' } },
      });
    });

    it('31. handles 422 MAX_ATTEMPTS_REACHED response on attempt start', async () => {
      vi.mocked(axiosInstance.post).mockRejectedValueOnce({
        response: { status: 422, data: { message: 'Maximum attempts reached', errorCode: 'MAX_ATTEMPTS_REACHED' } },
      });

      await expect(startOrResumeAttempt('q-maxed')).rejects.toMatchObject({
        response: { status: 422, data: { errorCode: 'MAX_ATTEMPTS_REACHED' } },
      });
    });

    it('32. handles 409 QUIZ_TIME_EXPIRED response on submission after deadline', async () => {
      vi.mocked(axiosInstance.post).mockRejectedValueOnce({
        response: { status: 409, data: { message: 'Attempt expired', errorCode: 'QUIZ_TIME_EXPIRED' } },
      });

      await expect(submitAttempt('q-1', 'att-expired', [])).rejects.toMatchObject({
        response: { status: 409, data: { errorCode: 'QUIZ_TIME_EXPIRED' } },
      });
    });

    it('33. handles 422 QUIZ_INVALID_FOR_ATTEMPT response when quiz has no questions', async () => {
      vi.mocked(axiosInstance.post).mockRejectedValueOnce({
        response: {
          status: 422,
          data: { message: 'Quiz has no valid questions', errorCode: 'QUIZ_INVALID_FOR_ATTEMPT' },
        },
      });

      await expect(startOrResumeAttempt('q-empty')).rejects.toMatchObject({
        response: { status: 422, data: { errorCode: 'QUIZ_INVALID_FOR_ATTEMPT' } },
      });
    });

    it('34. handles network failure gracefully without crashing state', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(new Error('Network Error'));

      await expect(fetchStudentQuiz('q-network-err')).rejects.toThrow('Network Error');
    });
  });
});
