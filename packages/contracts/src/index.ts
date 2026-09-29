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

