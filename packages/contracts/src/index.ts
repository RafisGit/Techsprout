export type UserRole = 'admin' | 'student' | 'instructor';

export interface UserDto {
  id: string;
  name: string;
  username: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface RegisterRequest {
  name: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: UserDto;
  token?: string;
}

export interface OtpSendRequest {
  phone: string;
}

export interface OtpVerifyRequest {
  phone: string;
  otp: string;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
  requestId?: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errorCode: string;
  statusCode: number;
  timestamp: string;
  requestId?: string;
  details?: unknown;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  services?: {
    database: 'up' | 'down';
    redis?: 'up' | 'down';
  };
}

export interface AuditLogDto {
  id: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

// --- CATALOG CONTRACTS ---

export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type CourseVisibility = 'PUBLIC' | 'PRIVATE';
export type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
export type LessonType = 'VIDEO' | 'TEXT' | 'PDF';

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isActive: boolean;
  courseCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCategoryRequest {
  name: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateCategoryRequest {
  name?: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface LessonDto {
  id: string;
  moduleId: string;
  title: string;
  description?: string | null;
  lessonType: LessonType;
  position: number;
  durationSeconds: number;
  isPreview: boolean;
  mediaId?: string | null;
  mediaUrl?: string | null;
  content?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateLessonRequest {
  title: string;
  description?: string | null;
  lessonType?: LessonType;
  position: number;
  durationSeconds?: number;
  isPreview?: boolean;
  mediaId?: string | null;
  content?: string | null;
}

export interface UpdateLessonRequest {
  title?: string;
  description?: string | null;
  lessonType?: LessonType;
  position?: number;
  durationSeconds?: number;
  isPreview?: boolean;
  mediaId?: string | null;
  content?: string | null;
}

export interface ModuleDto {
  id: string;
  courseId: string;
  title: string;
  description?: string | null;
  position: number;
  lessons?: LessonDto[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateModuleRequest {
  title: string;
  description?: string | null;
  position: number;
}

export interface UpdateModuleRequest {
  title?: string;
  description?: string | null;
  position?: number;
}

export interface CourseDto {
  id: string;
  title: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  status: CourseStatus;
  visibility: CourseVisibility;
  price: string;
  currency: string;
  level: CourseLevel;
  language: string;
  durationMinutes: number;
  thumbnailMediaId?: string | null;
  thumbnailUrl?: string | null;
  categoryId?: string;
  instructorId?: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  instructor?: {
    id: string;
    name: string;
    email?: string;
  };
  modulesCount?: number;
  lessonsCount?: number;
  modules?: ModuleDto[];
  publishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateCourseRequest {
  title: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  categoryId: string;
  instructorId?: string;
  price?: string | number;
  currency?: string;
  level?: CourseLevel;
  language?: string;
  durationMinutes?: number;
  visibility?: CourseVisibility;
  thumbnailMediaId?: string | null;
}

export interface UpdateCourseRequest {
  title?: string;
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  categoryId?: string;
  instructorId?: string;
  price?: string | number;
  currency?: string;
  level?: CourseLevel;
  language?: string;
  durationMinutes?: number;
  visibility?: CourseVisibility;
  thumbnailMediaId?: string | null;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedCoursesData {
  items: CourseDto[];
  pagination: PaginationMetadata;
}

// --- ENROLLMENT & LEARNING CONTRACTS ---

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type LessonProgressStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface EnrollmentDto {
  id: string;
  courseId: string;
  studentId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  progressPercentage?: number;
}

export interface CreateEnrollmentRequest {
  courseId: string;
}

export interface AdminAssignEnrollmentRequest {
  studentId: string;
}

export interface EnrolledCourseProgressDto {
  completedLessons: number;
  totalLessons: number;
  percentage: number;
}

export interface EnrolledCourseResumePointDto {
  lessonId: string;
  moduleId: string;
  lessonTitle: string;
  watchPositionSeconds: number;
}

export interface EnrolledCourseItemDto {
  enrollmentId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  progress: EnrolledCourseProgressDto;
  resumePoint?: EnrolledCourseResumePointDto | null;
  course: {
    id: string;
    title: string;
    slug: string;
    status: CourseStatus;
    thumbnailUrl?: string | null;
    category?: {
      id: string;
      name: string;
      slug: string;
    };
    instructor?: {
      id: string;
      name: string;
    };
  };
}

export interface PaginatedEnrollmentsData {
  items: EnrolledCourseItemDto[];
  pagination: PaginationMetadata;
}

export interface EnrollmentStatusResponse {
  isEnrolled: boolean;
  enrollment?: {
    id: string;
    status: EnrollmentStatus;
    enrolledAt: string;
    progressPercentage: number;
  } | null;
}

export interface ResumePointDto {
  lessonId: string | null;
  moduleId: string | null;
  lessonTitle: string;
  lessonType: LessonType;
  watchPositionSeconds: number;
  progressPercentage: number;
  isCourseCompleted: boolean;
}

export interface LessonProgressDto {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  watchPositionSeconds: number;
  completedAt?: string | null;
}

export interface CurriculumLessonDto {
  id: string;
  title: string;
  position: number;
  lessonType: LessonType;
  durationSeconds: number;
  isPreview: boolean;
  progress: LessonProgressDto;
}

export interface CurriculumModuleDto {
  id: string;
  title: string;
  position: number;
  lessons: CurriculumLessonDto[];
}

export interface LearningCurriculumDto {
  courseId: string;
  courseStatus: CourseStatus;
  progressPercentage: number;
  completedLessonsCount: number;
  totalLessonsCount: number;
  modules: CurriculumModuleDto[];
}

export interface LessonNavigationDto {
  previousLessonId: string | null;
  nextLessonId: string | null;
}

export interface LearningLessonContentDto {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  lessonType: LessonType;
  durationSeconds: number;
  mediaUrl?: string | null;
  content?: string | null;
  progress: LessonProgressDto;
  navigation: LessonNavigationDto;
}

export interface UpdateProgressCheckpointRequest {
  watchPositionSeconds: number;
}

export interface ToggleLessonCompleteRequest {
  completed: boolean;
}

// --- QUIZ & ASSESSMENT AUTHORING CONTRACTS (P4.2) ---

export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type QuizType = 'KNOWLEDGE_CHECK' | 'FINAL_EXAM';
export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';

export interface QuizOptionDto {
  id: string;
  questionId: string;
  optionText: string;
  position: number;
  isCorrect?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizQuestionDto {
  id: string;
  quizId: string;
  questionText: string;
  questionType: QuestionType;
  position: number;
  points: number;
  explanation?: string | null;
  options?: QuizOptionDto[];
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizDto {
  id: string;
  moduleId: string;
  title: string;
  description?: string | null;
  position: number;
  quizType: QuizType;
  passingScorePercentage: number;
  maxAttempts?: number | null;
  timeLimitMinutes?: number | null;
  status: QuizStatus;
  module?: {
    id: string;
    title: string;
    courseId: string;
  };
  course?: {
    id: string;
    title: string;
  };
  totalPoints?: number;
  questionsCount?: number;
  questions?: QuizQuestionDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuizRequest {
  title: string;
  description?: string | null;
  quizType?: QuizType;
  position: number;
  passingScorePercentage?: number;
  maxAttempts?: number | null;
  timeLimitMinutes?: number | null;
}

export interface UpdateQuizRequest {
  title?: string;
  description?: string | null;
  quizType?: QuizType;
  position?: number;
  passingScorePercentage?: number;
  maxAttempts?: number | null;
  timeLimitMinutes?: number | null;
}

export interface CreateQuestionOptionInput {
  optionText: string;
  position: number;
  isCorrect?: boolean;
}

export interface CreateQuestionRequest {
  questionText: string;
  questionType: QuestionType;
  position: number;
  points?: number;
  explanation?: string | null;
  options?: CreateQuestionOptionInput[];
}

export interface UpdateQuestionRequest {
  questionText?: string;
  questionType?: QuestionType;
  position?: number;
  points?: number;
  explanation?: string | null;
}

export interface CreateOptionRequest {
  optionText: string;
  position: number;
  isCorrect?: boolean;
}

export interface UpdateOptionRequest {
  optionText?: string;
  position?: number;
  isCorrect?: boolean;
}

export interface ReorderItem {
  id: string;
  position: number;
}

export interface ReorderRequest {
  items: ReorderItem[];
}

// --- STUDENT QUIZ & ATTEMPT CONTRACTS (P4.3) ---

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'ABANDONED';

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

export interface StudentAnswerItem {
  questionId: string;
  selectedOptionIds: string[];
}

export interface SaveAnswersRequest {
  answers: StudentAnswerItem[];
}

export interface SubmitAttemptRequest {
  answers?: StudentAnswerItem[];
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
  savedAnswers: StudentAnswerItem[];
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

