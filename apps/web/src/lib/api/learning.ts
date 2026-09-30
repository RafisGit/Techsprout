import { axiosInstance } from '@/lib/axiosInstance';
import type {
  EnrollmentDto,
  CreateEnrollmentRequest,
  PaginatedEnrollmentsData,
  EnrollmentStatusResponse,
  LearningCurriculumDto,
  LearningLessonContentDto,
  ResumePointDto,
  UpdateProgressCheckpointRequest,
  ToggleLessonCompleteRequest,
} from '@techsprout/contracts';

export interface UserEnrollmentsQueryParams {
  status?: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  page?: number;
  limit?: number;
}

export interface ProgressCheckpointResponse {
  lessonId: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  watchPositionSeconds: number;
  isCompleted: boolean;
  courseProgressPercentage: number;
}

export interface ToggleLessonCompleteResponse {
  lessonId: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  completedAt: string | null;
  courseProgress: {
    completedLessons: number;
    totalLessons: number;
    percentage: number;
    isCourseCompleted: boolean;
  };
}

// ==========================================
// ENROLLMENT API
// ==========================================

export async function selfEnroll(courseId: string): Promise<EnrollmentDto> {
  const requestBody: CreateEnrollmentRequest = { courseId };
  const response = await axiosInstance.post('/api/v1/enrollments', requestBody);
  return response.data.data;
}

export async function fetchUserEnrollments(
  params?: UserEnrollmentsQueryParams
): Promise<PaginatedEnrollmentsData> {
  const response = await axiosInstance.get('/api/v1/enrollments', { params });
  return response.data.data;
}

export async function fetchCourseEnrollmentStatus(
  courseId: string
): Promise<EnrollmentStatusResponse> {
  const response = await axiosInstance.get(`/api/v1/courses/${courseId}/enrollment`);
  return response.data.data;
}

export async function cancelEnrollment(
  enrollmentId: string
): Promise<{ id: string; status: string }> {
  const response = await axiosInstance.post(`/api/v1/enrollments/${enrollmentId}/cancel`);
  return response.data.data;
}

// ==========================================
// LEARNING WORKSPACE API
// ==========================================

export async function fetchLearningCurriculum(
  courseId: string
): Promise<LearningCurriculumDto> {
  const response = await axiosInstance.get(`/api/v1/learn/courses/${courseId}/curriculum`);
  return response.data.data;
}

export async function fetchLearningResume(
  courseId: string
): Promise<ResumePointDto> {
  const response = await axiosInstance.get(`/api/v1/learn/courses/${courseId}/resume`);
  return response.data.data;
}

export async function fetchLearningLesson(
  courseId: string,
  lessonId: string
): Promise<LearningLessonContentDto> {
  const response = await axiosInstance.get(
    `/api/v1/learn/courses/${courseId}/lessons/${lessonId}`
  );
  return response.data.data;
}

export async function saveProgressCheckpoint(
  courseId: string,
  lessonId: string,
  watchPositionSeconds: number
): Promise<ProgressCheckpointResponse> {
  const requestBody: UpdateProgressCheckpointRequest = {
    watchPositionSeconds: Math.max(0, Math.floor(watchPositionSeconds)),
  };
  const response = await axiosInstance.post(
    `/api/v1/learn/courses/${courseId}/lessons/${lessonId}/progress`,
    requestBody
  );
  return response.data.data;
}

export async function toggleLessonComplete(
  courseId: string,
  lessonId: string,
  completed: boolean
): Promise<ToggleLessonCompleteResponse> {
  const requestBody: ToggleLessonCompleteRequest = { completed };
  const response = await axiosInstance.post(
    `/api/v1/learn/courses/${courseId}/lessons/${lessonId}/complete`,
    requestBody
  );
  return response.data.data;
}
