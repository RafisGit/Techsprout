import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchAdminCourses,
  fetchAdminCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  publishCourse,
  unpublishCourse,
  archiveCourse,
  fetchAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createModule,
  updateModule,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson,
  uploadImageMedia,
  uploadVideoMedia,
  fetchAdminUsers,
} from '@/lib/api/catalog';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  CourseDto,
  CategoryDto,
  ModuleDto,
  LessonDto,
  CreateCourseRequest,
  CreateCategoryRequest,
  CreateModuleRequest,
  CreateLessonRequest,
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

describe('P2.3 — Admin Catalog Frontend Integration & API Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1. COURSES: LIST, FILTER, CREATE, EDIT
  // ==========================================
  describe('Course Catalog Management', () => {
    it('should query admin courses with search, category, status, and pagination parameters', async () => {
      const mockResult = {
        items: [
          {
            id: 'c1',
            title: 'Full-Stack Web Development',
            slug: 'full-stack-web-development',
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
            price: '49.99',
            currency: 'USD',
            level: 'INTERMEDIATE',
            category: { id: 'cat-1', name: 'Web Development', slug: 'web-development' },
            instructor: { id: 'u-1', name: 'Dr. Jane Doe', email: 'jane@techsprout.io' },
            createdAt: '2026-09-30T00:00:00.000Z',
            updatedAt: '2026-09-30T00:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockResult },
      });

      const params = {
        page: 1,
        limit: 10,
        search: 'Full-Stack',
        categoryId: 'cat-1',
        status: 'PUBLISHED',
        level: 'INTERMEDIATE',
        sortBy: 'title' as const,
        sortOrder: 'asc' as const,
      };

      const result = await fetchAdminCourses(params);

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/courses', {
        params,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Full-Stack Web Development');
      expect(result.pagination.total).toBe(1);
    });

    it('should fetch course details by ID including modules and lessons', async () => {
      const mockCourse: CourseDto = {
        id: 'c-uuid-1',
        title: 'Robotics 101',
        slug: 'robotics-101',
        status: 'DRAFT',
        visibility: 'PUBLIC',
        categoryId: 'cat-robotics',
        instructorId: 'inst-1',
        price: '0.00',
        currency: 'USD',
        level: 'BEGINNER',
        language: 'English',
        durationMinutes: 120,
        createdAt: '2026-09-30T00:00:00.000Z',
        updatedAt: '2026-09-30T00:00:00.000Z',
        modules: [
          {
            id: 'm-1',
            courseId: 'c-uuid-1',
            title: 'Module 1: Introduction',
            position: 1,
            createdAt: '2026-09-30T00:00:00.000Z',
            updatedAt: '2026-09-30T00:00:00.000Z',
            lessons: [
              {
                id: 'l-1',
                moduleId: 'm-1',
                title: 'Lesson 1.1: Welcome',
                lessonType: 'VIDEO',
                position: 1,
                durationSeconds: 300,
                isPreview: true,
                mediaId: 'med-video-1',
                createdAt: '2026-09-30T00:00:00.000Z',
                updatedAt: '2026-09-30T00:00:00.000Z',
              },
            ],
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockCourse },
      });

      const course = await fetchAdminCourseById('c-uuid-1');
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/courses/c-uuid-1');
      expect(course.id).toBe('c-uuid-1');
      expect(course.modules).toHaveLength(1);
      expect(course.modules![0].lessons).toHaveLength(1);
    });

    it('should send correct payload when creating a new course', async () => {
      const payload: CreateCourseRequest = {
        title: 'Modern AI with Python',
        slug: 'modern-ai-with-python',
        shortDescription: 'Learn Python AI',
        description: 'Comprehensive AI curriculum',
        categoryId: 'cat-ai',
        price: '29.99',
        currency: 'USD',
        level: 'INTERMEDIATE',
        language: 'English',
        durationMinutes: 180,
        visibility: 'PUBLIC',
        thumbnailMediaId: 'thumb-uuid',
      };

      const mockCreated = { id: 'c-new', ...payload, status: 'DRAFT' };
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockCreated },
      });

      const created = await createCourse(payload);
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/courses', payload);
      expect(created.status).toBe('DRAFT');
      expect(created.title).toBe('Modern AI with Python');
    });

    it('should update course metadata using PATCH', async () => {
      vi.mocked(axiosInstance.patch).mockResolvedValueOnce({
        data: { success: true, data: { id: 'c-1', title: 'Updated Title' } },
      });

      const updated = await updateCourse('c-1', { title: 'Updated Title' });
      expect(axiosInstance.patch).toHaveBeenCalledWith('/api/v1/admin/courses/c-1', {
        title: 'Updated Title',
      });
      expect(updated.title).toBe('Updated Title');
    });

    it('should delete draft course when requested', async () => {
      vi.mocked(axiosInstance.delete).mockResolvedValueOnce({
        data: { success: true, data: { deleted: true, id: 'c-draft' } },
      });

      const res = await deleteCourse('c-draft');
      expect(axiosInstance.delete).toHaveBeenCalledWith('/api/v1/admin/courses/c-draft');
      expect(res.deleted).toBe(true);
    });
  });

  // ==========================================
  // 2. PUBLISHING STATE MACHINE & ERROR HANDLING
  // ==========================================
  describe('Publishing Lifecycle Management', () => {
    it('should publish course via dedicated API endpoint', async () => {
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: { id: 'c-1', status: 'PUBLISHED' } },
      });

      const result = await publishCourse('c-1');
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/courses/c-1/publish');
      expect(result.status).toBe('PUBLISHED');
    });

    it('should unpublish course via dedicated API endpoint', async () => {
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: { id: 'c-1', status: 'DRAFT' } },
      });

      const result = await unpublishCourse('c-1');
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/courses/c-1/unpublish');
      expect(result.status).toBe('DRAFT');
    });

    it('should archive course via dedicated API endpoint', async () => {
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: { id: 'c-1', status: 'ARCHIVED' } },
      });

      const result = await archiveCourse('c-1');
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/courses/c-1/archive');
      expect(result.status).toBe('ARCHIVED');
    });

    it('should propagate backend validation error on publish (e.g. 0 modules or missing lesson video)', async () => {
      const backendError = {
        response: {
          status: 400,
          data: {
            success: false,
            message: 'Course must contain at least one module before publishing',
            errorCode: 'COURSE_PUBLISH_VALIDATION_FAILED',
          },
        },
      };

      vi.mocked(axiosInstance.post).mockRejectedValueOnce(backendError);

      await expect(publishCourse('c-empty')).rejects.toEqual(backendError);
    });
  });

  // ==========================================
  // 3. CATEGORIES MANAGEMENT & CONFLICT HANDLING
  // ==========================================
  describe('Category Management', () => {
    it('should fetch all admin categories', async () => {
      const mockCategories: CategoryDto[] = [
        { id: 'cat-1', name: 'Web Dev', slug: 'web-dev', isActive: true, createdAt: '2026-09-30' },
        { id: 'cat-2', name: 'AI', slug: 'ai', isActive: false, createdAt: '2026-09-30' },
      ];

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockCategories },
      });

      const categories = await fetchAdminCategories();
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/categories');
      expect(categories).toHaveLength(2);
      expect(categories[0].slug).toBe('web-dev');
    });

    it('should create new category with auto/custom slug', async () => {
      const req: CreateCategoryRequest = {
        name: 'Cloud Computing',
        slug: 'cloud-computing',
        description: 'AWS, GCP, and Cloud Native architecture',
        isActive: true,
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: { id: 'cat-cloud', ...req } },
      });

      const created = await createCategory(req);
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/categories', req);
      expect(created.name).toBe('Cloud Computing');
    });

    it('should update category active status and details', async () => {
      vi.mocked(axiosInstance.patch).mockResolvedValueOnce({
        data: { success: true, data: { id: 'cat-1', isActive: false } },
      });

      const updated = await updateCategory('cat-1', { isActive: false });
      expect(axiosInstance.patch).toHaveBeenCalledWith('/api/v1/admin/categories/cat-1', {
        isActive: false,
      });
      expect(updated.isActive).toBe(false);
    });

    it('should handle CATEGORY_HAS_COURSES conflict error on deletion', async () => {
      const conflictError = {
        response: {
          status: 409,
          data: {
            success: false,
            message: 'Cannot delete category with associated courses',
            errorCode: 'CATEGORY_HAS_COURSES',
          },
        },
      };

      vi.mocked(axiosInstance.delete).mockRejectedValueOnce(conflictError);

      await expect(deleteCategory('cat-in-use')).rejects.toEqual(conflictError);
    });
  });

  // ==========================================
  // 4. MODULE & LESSON MANAGEMENT
  // ==========================================
  describe('Module & Lesson Management', () => {
    it('should create a module within a course preserving position', async () => {
      const req: CreateModuleRequest = {
        title: 'Module 1: Foundations',
        description: 'Core fundamentals',
        position: 1,
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: { id: 'mod-1', courseId: 'c-1', ...req } },
      });

      const mod = await createModule('c-1', req);
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/courses/c-1/modules', req);
      expect(mod.position).toBe(1);
    });

    it('should update module title and position', async () => {
      vi.mocked(axiosInstance.patch).mockResolvedValueOnce({
        data: { success: true, data: { id: 'mod-1', title: 'Advanced Topics', position: 2 } },
      });

      const updated = await updateModule('mod-1', { title: 'Advanced Topics', position: 2 });
      expect(axiosInstance.patch).toHaveBeenCalledWith('/api/v1/admin/modules/mod-1', {
        title: 'Advanced Topics',
        position: 2,
      });
      expect(updated.position).toBe(2);
    });

    it('should delete module by ID', async () => {
      vi.mocked(axiosInstance.delete).mockResolvedValueOnce({
        data: { success: true, data: { deleted: true, id: 'mod-1' } },
      });

      const res = await deleteModule('mod-1');
      expect(axiosInstance.delete).toHaveBeenCalledWith('/api/v1/admin/modules/mod-1');
      expect(res.deleted).toBe(true);
    });

    it('should create lesson with allowed types (VIDEO, TEXT, PDF) and media attachment', async () => {
      const lessonReq: CreateLessonRequest = {
        title: 'Video Lesson 1',
        description: 'Streaming guide',
        lessonType: 'VIDEO',
        position: 1,
        durationSeconds: 600,
        isPreview: true,
        mediaId: 'med-video-id',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: { id: 'les-1', moduleId: 'mod-1', ...lessonReq } },
      });

      const les = await createLesson('mod-1', lessonReq);
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/admin/modules/mod-1/lessons', lessonReq);
      expect(les.lessonType).toBe('VIDEO');
      expect(les.mediaId).toBe('med-video-id');
      expect(les.isPreview).toBe(true);
    });

    it('should update lesson preview toggle and duration', async () => {
      vi.mocked(axiosInstance.patch).mockResolvedValueOnce({
        data: { success: true, data: { id: 'les-1', isPreview: false, durationSeconds: 900 } },
      });

      const updated = await updateLesson('les-1', { isPreview: false, durationSeconds: 900 });
      expect(axiosInstance.patch).toHaveBeenCalledWith('/api/v1/admin/lessons/les-1', {
        isPreview: false,
        durationSeconds: 900,
      });
      expect(updated.isPreview).toBe(false);
    });

    it('should delete lesson by ID', async () => {
      vi.mocked(axiosInstance.delete).mockResolvedValueOnce({
        data: { success: true, data: { deleted: true, id: 'les-1' } },
      });

      const res = await deleteLesson('les-1');
      expect(axiosInstance.delete).toHaveBeenCalledWith('/api/v1/admin/lessons/les-1');
      expect(res.deleted).toBe(true);
    });
  });

  // ==========================================
  // 5. MEDIA UPLOADS & CLOUDINARY INTEGRATION
  // ==========================================
  describe('Media Upload Client Integration', () => {
    it('should upload image media with multipart formData without exposing secrets', async () => {
      const mockResult = {
        id: 'media-img-1',
        publicId: 'techsprout/images/courses/img1',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/img1.jpg',
        format: 'jpg',
        bytes: 10240,
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: mockResult,
      });

      const fakeFile = new File(['fake content'], 'test.png', { type: 'image/png' });
      const result = await uploadImageMedia(fakeFile, 'techsprout/images/courses');

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/media/upload/image',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );
      expect(result.id).toBe('media-img-1');
      expect(result.secureUrl).toContain('res.cloudinary.com');
    });

    it('should upload video media with multipart formData', async () => {
      const mockResult = {
        id: 'media-vid-1',
        publicId: 'techsprout/videos/lessons/vid1',
        secureUrl: 'https://res.cloudinary.com/demo/video/upload/vid1.mp4',
        duration: 320,
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: mockResult,
      });

      const fakeVideo = new File(['video content'], 'test.mp4', { type: 'video/mp4' });
      const result = await uploadVideoMedia(fakeVideo, 'techsprout/videos/lessons');

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/media/upload/video',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      );
      expect(result.id).toBe('media-vid-1');
      expect(result.duration).toBe(320);
    });
  });

  // ==========================================
  // 6. USERS & AUTHORIZATION
  // ==========================================
  describe('User Listing & Authorization Constraints', () => {
    it('should fetch admin users list for instructor assignment', async () => {
      const mockUsers = [
        {
          id: 'u-admin',
          name: 'Super Admin',
          username: 'admin',
          email: 'admin@techsprout.io',
          role: 'admin' as const,
          isActive: true,
          isVerified: true,
          createdAt: '2026-09-30',
        },
        {
          id: 'u-inst',
          name: 'Prof. Smith',
          username: 'smith',
          email: 'smith@techsprout.io',
          role: 'instructor' as const,
          isActive: true,
          isVerified: true,
          createdAt: '2026-09-30',
        },
      ];

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockUsers },
      });

      const users = await fetchAdminUsers(10, 0);
      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/admin/users', {
        params: { limit: 10, offset: 0 },
      });
      expect(users).toHaveLength(2);
      expect(users.find((u) => u.role === 'instructor')).toBeDefined();
    });
  });
});
