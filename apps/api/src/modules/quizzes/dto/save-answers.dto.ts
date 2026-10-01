import { z } from 'zod';

export type QuizType = 'KNOWLEDGE_CHECK' | 'FINAL_EXAM';
export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';

export const studentAnswerItemSchema = z.object({
  questionId: z.string().uuid('Invalid question ID format'),
  selectedOptionIds: z.array(z.string().uuid('Invalid option ID format')),
});

export const saveAnswersSchema = z.object({
  answers: z.array(studentAnswerItemSchema).min(1, 'At least one answer is required'),
});

export const submitAttemptSchema = z.object({
  answers: z.array(studentAnswerItemSchema).optional(),
});

export type StudentAnswerItemDto = z.infer<typeof studentAnswerItemSchema>;
export type SaveAnswersDto = z.infer<typeof saveAnswersSchema>;
export type SubmitAttemptDto = z.infer<typeof submitAttemptSchema>;

export interface StudentQuizOptionDto {
  id: string;
  optionText: string;
  position: number;
}

export interface StudentQuizQuestionDto {
  id: string;
  questionText: string;
  questionType: QuestionType;
  position: number;
  points: number;
  options: StudentQuizOptionDto[];
}

export interface StudentQuizDto {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  description?: string | null;
  quizType: QuizType;
  passingScorePercentage: number;
  maxAttempts?: number | null;
  timeLimitMinutes?: number | null;
  totalPoints: number;
  questionsCount: number;
  userAttemptsCount: number;
  bestScorePercentage: number | null;
  isPassed: boolean;
  questions: StudentQuizQuestionDto[];
}

export interface StudentActiveAttemptDto {
  id: string;
  quizId: string;
  attemptNumber: number;
  status: 'IN_PROGRESS';
  startedAt: string;
  lastSavedAt: string;
  expiresAt?: string | null;
  timeLimitMinutes?: number | null;
  questions: StudentQuizQuestionDto[];
  savedAnswers: StudentAnswerItemDto[];
}

export interface StudentQuizResultDto {
  attemptId: string;
  quizId: string;
  attemptNumber: number;
  status: 'SUBMITTED';
  score: number;
  totalPoints: number;
  percentage: number;
  isPassed: boolean;
  submittedAt: string;
  courseProgressPercentage: number;
  isCourseCompleted: boolean;
}

export interface QuestionReviewOptionDto {
  id: string;
  optionText: string;
  position: number;
  isCorrect: boolean;
}

export interface QuestionReviewDto {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  points: number;
  pointsAwarded: number;
  isCorrect: boolean;
  selectedOptionIds: string[];
  correctOptionIds: string[];
  explanation?: string | null;
  options: QuestionReviewOptionDto[];
}

export interface StudentQuizReviewDto {
  attemptId: string;
  quizId: string;
  attemptNumber: number;
  status: 'SUBMITTED';
  score: number;
  totalPoints: number;
  percentage: number;
  isPassed: boolean;
  submittedAt: string;
  questions: QuestionReviewDto[];
}
