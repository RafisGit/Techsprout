import { axiosInstance } from '@/lib/axiosInstance';
import type { PaginatedCoursesData, CourseDto } from '@techsprout/contracts';

export interface InstructorCourseQueryParams {
  page?: number;
  limit?: number;
  status?: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  search?: string;
}

export interface ReviewRequestSummary {
  id: string;
  courseId: string;
  instructorId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  adminFeedback?: string | null;
  submissionNotes?: string | null;
  submittedAt: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  updatedAt: string;
  reviewer?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface InstructorCourseDetail extends Omit<CourseDto, 'modules'> {
  modules?: Array<{
    id: string;
    courseId?: string;
    title: string;
    position: number;
    lessons?: Array<{
      id: string;
      title: string;
      position: number;
      lessonType?: string;
    }>;
  }>;
  currentReview?: ReviewRequestSummary | null;
  reviewRequests?: ReviewRequestSummary[];
}

export interface CourseReviewStatusResponse {
  courseId: string;
  courseStatus: string;
  currentReview: ReviewRequestSummary | null;
  latestReviewRequest?: ReviewRequestSummary | null;
  history: ReviewRequestSummary[];
}

export interface SubmitCourseReviewData {
  submissionNotes?: string;
}

export interface RejectCourseReviewData {
  adminFeedback: string;
}

export interface ReviewQueueItem {
  id: string;
  courseId: string;
  instructorId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  submissionNotes: string | null;
  adminFeedback: string | null;
  reviewedBy: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  updatedAt: string;
  course: {
    id: string;
    title: string;
    slug: string;
    status: string;
    price: string;
    currency: string;
    thumbnailUrl?: string;
  };
  instructor: {
    id: string;
    name: string;
    email: string;
  };
}

export interface PaginatedReviewQueueData {
  items: ReviewQueueItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// =========================================================================
// INSTRUCTOR API FUNCTIONS
// =========================================================================

export async function fetchInstructorCourses(
  params?: InstructorCourseQueryParams
): Promise<PaginatedCoursesData> {
  const response = await axiosInstance.get('/api/v1/instructor/courses', { params });
  return response.data.data;
}

export async function fetchInstructorCourseById(id: string): Promise<InstructorCourseDetail> {
  const response = await axiosInstance.get(`/api/v1/instructor/courses/${id}`);
  return response.data.data;
}

export async function fetchInstructorReviewStatus(id: string): Promise<CourseReviewStatusResponse> {
  const response = await axiosInstance.get(`/api/v1/instructor/courses/${id}/review-status`);
  return response.data.data;
}

export const fetchCourseReviewStatus = fetchInstructorReviewStatus;

export async function submitCourseForReview(
  id: string,
  data?: SubmitCourseReviewData
): Promise<{ course: CourseDto; reviewRequest: ReviewRequestSummary }> {
  const response = await axiosInstance.post(
    `/api/v1/instructor/courses/${id}/submit-for-review`,
    data || {}
  );
  return response.data.data;
}

export async function withdrawCourseReview(
  id: string
): Promise<{ course: CourseDto; reviewRequest: ReviewRequestSummary }> {
  const response = await axiosInstance.post(`/api/v1/instructor/courses/${id}/withdraw-review`);
  return response.data.data;
}

// =========================================================================
// ADMINISTRATOR REVIEW QUEUE API FUNCTIONS
// =========================================================================

export async function fetchAdminReviewQueue(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<PaginatedReviewQueueData> {
  const response = await axiosInstance.get('/api/v1/admin/courses/review-queue', { params });
  return response.data.data;
}

export async function approveCourseReview(
  courseId: string
): Promise<{ course: CourseDto; reviewRequest: ReviewRequestSummary }> {
  const response = await axiosInstance.post(`/api/v1/admin/courses/${courseId}/approve-review`);
  return response.data.data;
}

export async function rejectCourseReview(
  courseId: string,
  data: RejectCourseReviewData
): Promise<{ course: CourseDto; reviewRequest: ReviewRequestSummary }> {
  const response = await axiosInstance.post(`/api/v1/admin/courses/${courseId}/reject-review`, data);
  return response.data.data;
}

// =========================================================================
// COURSE ENROLLMENTS & LEARNER ROSTER API
// =========================================================================

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface CourseEnrollmentStudent {
  id: string;
  name: string;
  email: string;
}

export interface CourseEnrollmentItem {
  enrollmentId: string;
  student: CourseEnrollmentStudent;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt: string | null;
  lastAccessedAt: string | null;
  progressPercentage: number;
}

export interface CourseEnrollmentsQueryParams {
  status?: EnrollmentStatus;
  page?: number;
  limit?: number;
}

export interface CourseEnrollmentsResponse {
  courseId: string;
  totalEnrolled: number;
  completedCount: number;
  items: CourseEnrollmentItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export async function fetchCourseEnrollments(
  courseId: string,
  params?: CourseEnrollmentsQueryParams
): Promise<CourseEnrollmentsResponse> {
  const response = await axiosInstance.get(`/api/v1/admin/courses/${courseId}/enrollments`, {
    params,
  });
  return response.data.data;
}

