import { axiosInstance } from '@/lib/axiosInstance';
import type {
  CategoryDto,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CourseDto,
  CreateCourseRequest,
  UpdateCourseRequest,
  ModuleDto,
  CreateModuleRequest,
  UpdateModuleRequest,
  LessonDto,
  CreateLessonRequest,
  UpdateLessonRequest,
  PaginatedCoursesData,
} from '@techsprout/contracts';

export interface AdminCourseQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  categorySlug?: string;
  level?: string;
  language?: string;
  status?: string;
  visibility?: string;
  instructorId?: string;
  sortBy?: 'createdAt' | 'price' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface AdminUserDto {
  id: string;
  name: string;
  username: string;
  email: string;
  phone?: string | null;
  isActive: boolean;
  isVerified: boolean;
  role: 'student' | 'admin' | 'instructor';
  createdAt: string;
}

export interface MediaUploadResult {
  id: string;
  publicId: string;
  secureUrl: string;
  format?: string;
  bytes?: number;
  duration?: number;
}

// ==========================================
// COURSE API
// ==========================================

export async function fetchAdminCourses(
  params?: AdminCourseQueryParams
): Promise<PaginatedCoursesData> {
  const response = await axiosInstance.get('/api/v1/admin/courses', { params });
  return response.data.data;
}

export async function fetchAdminCourseById(id: string): Promise<CourseDto> {
  const response = await axiosInstance.get(`/api/v1/admin/courses/${id}`);
  return response.data.data;
}

export async function createCourse(data: CreateCourseRequest): Promise<CourseDto> {
  const response = await axiosInstance.post('/api/v1/admin/courses', data);
  return response.data.data;
}

export async function updateCourse(id: string, data: UpdateCourseRequest): Promise<CourseDto> {
  const response = await axiosInstance.patch(`/api/v1/admin/courses/${id}`, data);
  return response.data.data;
}

export async function deleteCourse(id: string): Promise<{ deleted: boolean; id: string }> {
  const response = await axiosInstance.delete(`/api/v1/admin/courses/${id}`);
  return response.data.data;
}

// Lifecycle transitions
export async function publishCourse(id: string): Promise<CourseDto> {
  const response = await axiosInstance.post(`/api/v1/admin/courses/${id}/publish`);
  return response.data.data;
}

export async function unpublishCourse(id: string): Promise<CourseDto> {
  const response = await axiosInstance.post(`/api/v1/admin/courses/${id}/unpublish`);
  return response.data.data;
}

export async function archiveCourse(id: string): Promise<CourseDto> {
  const response = await axiosInstance.post(`/api/v1/admin/courses/${id}/archive`);
  return response.data.data;
}

// ==========================================
// CATEGORY API
// ==========================================

export async function fetchAdminCategories(): Promise<CategoryDto[]> {
  const response = await axiosInstance.get('/api/v1/admin/categories');
  return response.data.data;
}

export async function fetchAdminCategoryById(id: string): Promise<CategoryDto> {
  const response = await axiosInstance.get(`/api/v1/admin/categories/${id}`);
  return response.data.data;
}

export async function createCategory(data: CreateCategoryRequest): Promise<CategoryDto> {
  const response = await axiosInstance.post('/api/v1/admin/categories', data);
  return response.data.data;
}

export async function updateCategory(
  id: string,
  data: UpdateCategoryRequest
): Promise<CategoryDto> {
  const response = await axiosInstance.patch(`/api/v1/admin/categories/${id}`, data);
  return response.data.data;
}

export async function deleteCategory(id: string): Promise<{ deleted: boolean; id: string }> {
  const response = await axiosInstance.delete(`/api/v1/admin/categories/${id}`);
  return response.data.data;
}

// ==========================================
// MODULE API
// ==========================================

export async function createModule(
  courseId: string,
  data: CreateModuleRequest
): Promise<ModuleDto> {
  const response = await axiosInstance.post(`/api/v1/admin/courses/${courseId}/modules`, data);
  return response.data.data;
}

export async function updateModule(id: string, data: UpdateModuleRequest): Promise<ModuleDto> {
  const response = await axiosInstance.patch(`/api/v1/admin/modules/${id}`, data);
  return response.data.data;
}

export async function deleteModule(id: string): Promise<{ deleted: boolean; id: string }> {
  const response = await axiosInstance.delete(`/api/v1/admin/modules/${id}`);
  return response.data.data;
}

// ==========================================
// LESSON API
// ==========================================

export async function createLesson(
  moduleId: string,
  data: CreateLessonRequest
): Promise<LessonDto> {
  const response = await axiosInstance.post(`/api/v1/admin/modules/${moduleId}/lessons`, data);
  return response.data.data;
}

export async function updateLesson(id: string, data: UpdateLessonRequest): Promise<LessonDto> {
  const response = await axiosInstance.patch(`/api/v1/admin/lessons/${id}`, data);
  return response.data.data;
}

export async function deleteLesson(id: string): Promise<{ deleted: boolean; id: string }> {
  const response = await axiosInstance.delete(`/api/v1/admin/lessons/${id}`);
  return response.data.data;
}

// ==========================================
// MEDIA API
// ==========================================

export async function uploadImageMedia(file: File, folder?: string): Promise<MediaUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (folder) formData.append('folder', folder);

  const response = await axiosInstance.post('/api/v1/media/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function uploadVideoMedia(file: File, folder?: string): Promise<MediaUploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (folder) formData.append('folder', folder);

  const response = await axiosInstance.post('/api/v1/media/upload/video', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

// ==========================================
// USERS API (FOR INSTRUCTOR LISTING)
// ==========================================

export async function fetchAdminUsers(limit = 100, offset = 0): Promise<AdminUserDto[]> {
  const response = await axiosInstance.get('/api/v1/admin/users', {
    params: { limit, offset },
  });
  return response.data.data;
}
