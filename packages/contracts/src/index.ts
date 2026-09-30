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
