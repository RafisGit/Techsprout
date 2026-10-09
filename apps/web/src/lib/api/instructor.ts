import { axiosInstance } from '@/lib/axiosInstance';
import type { PaginatedCoursesData, CourseDto } from '@techsprout/contracts';

export interface InstructorCourseQueryParams {
  page?: number;
  limit?: number;
  status?: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  search?: string;
}

export interface InstructorCourseDetail extends CourseDto {
  reviewRequests?: Array<{
    id: string;
    courseId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
    adminFeedback?: string | null;
    submissionNotes?: string | null;
    submittedAt: string;
    reviewedAt?: string | null;
  }>;
}

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

export async function fetchInstructorReviewStatus(id: string): Promise<any> {
  const response = await axiosInstance.get(`/api/v1/instructor/courses/${id}/review-status`);
  return response.data.data;
}
