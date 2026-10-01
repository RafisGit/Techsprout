import { axiosInstance } from '@/lib/axiosInstance';
import type {
  StudentQuizDto,
  StudentActiveAttemptDto,
  StudentQuizResultDto,
  StudentQuizReviewDto,
  StudentAnswerItem,
  SaveAnswersRequest,
  SubmitAttemptRequest,
} from '@techsprout/contracts';

export interface SaveAnswersResponse {
  attemptId: string;
  savedCount: number;
  lastSavedAt: string;
}

/**
 * GET /api/v1/learn/quizzes/:quizId
 * Fetches published quiz overview and questions for an enrolled student.
 * Answer keys and explanations are strictly omitted by the server.
 */
export async function fetchStudentQuiz(quizId: string): Promise<StudentQuizDto> {
  const response = await axiosInstance.get(`/api/v1/learn/quizzes/${quizId}`);
  return response.data.data;
}

/**
 * POST /api/v1/learn/quizzes/:quizId/attempts
 * Starts a new attempt or resumes an existing IN_PROGRESS attempt idempotently.
 */
export async function startOrResumeAttempt(
  quizId: string
): Promise<StudentActiveAttemptDto> {
  const response = await axiosInstance.post(`/api/v1/learn/quizzes/${quizId}/attempts`);
  return response.data.data;
}

/**
 * GET /api/v1/learn/quizzes/:quizId/attempts/:attemptId
 * Retrieves attempt details (active attempt questions or submitted summary).
 */
export async function fetchAttemptDetail(
  quizId: string,
  attemptId: string
): Promise<StudentActiveAttemptDto | StudentQuizResultDto> {
  const response = await axiosInstance.get(
    `/api/v1/learn/quizzes/${quizId}/attempts/${attemptId}`
  );
  return response.data.data;
}

/**
 * PATCH /api/v1/learn/quizzes/:quizId/attempts/:attemptId/answers
 * Auto-saves student answers for an active in-progress attempt.
 */
export async function saveAttemptAnswers(
  quizId: string,
  attemptId: string,
  answers: StudentAnswerItem[]
): Promise<SaveAnswersResponse> {
  const requestBody: SaveAnswersRequest = { answers };
  const response = await axiosInstance.patch(
    `/api/v1/learn/quizzes/${quizId}/attempts/${attemptId}/answers`,
    requestBody
  );
  return response.data.data;
}

/**
 * POST /api/v1/learn/quizzes/:quizId/attempts/:attemptId/submit
 * Submits the attempt for authoritative server-side grading and scoring.
 */
export async function submitAttempt(
  quizId: string,
  attemptId: string,
  answers?: StudentAnswerItem[]
): Promise<StudentQuizResultDto> {
  const requestBody: SubmitAttemptRequest = answers ? { answers } : {};
  const response = await axiosInstance.post(
    `/api/v1/learn/quizzes/${quizId}/attempts/${attemptId}/submit`,
    requestBody
  );
  return response.data.data;
}

/**
 * GET /api/v1/learn/quizzes/:quizId/attempts/:attemptId/review
 * Retrieves full quiz attempt review with correct answers, scores, and explanations.
 * Available only for SUBMITTED attempts.
 */
export async function fetchAttemptReview(
  quizId: string,
  attemptId: string
): Promise<StudentQuizReviewDto> {
  const response = await axiosInstance.get(
    `/api/v1/learn/quizzes/${quizId}/attempts/${attemptId}/review`
  );
  return response.data.data;
}
