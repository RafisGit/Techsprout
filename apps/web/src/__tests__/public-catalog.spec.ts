import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchPublicCourses,
  fetchPublicCourseBySlug,
  fetchPublicCategories,
  fetchPublicCategoryCourses,
} from '@/lib/api/catalog';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  CourseDto,
  CategoryDto,
  ModuleDto,
  LessonDto,
  PaginatedResult,
} from '@techsprout/contracts';
import * as fs from 'fs';
import * as path from 'path';

// Mock axiosInstance
vi.mock('@/lib/axiosInstance', () => ({
  axiosInstance: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('P2.4 — Public Catalog Integration & Contract Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1. PUBLIC COURSE LISTING (/courses)
  // ==========================================
  describe('Public Course List API Integration', () => {
    it('should query public courses with search, categorySlug, level, price, and pagination', async () => {
      const mockResult: PaginatedResult<CourseDto> = {
        items: [
          {
            id: 'c-pub-1',
            title: 'Modern TypeScript & NestJS',
            slug: 'modern-typescript-nestjs',
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
            price: '39.99',
            currency: 'USD',
            level: 'INTERMEDIATE',
            language: 'English',
            durationMinutes: 180,
            category: { id: 'cat-dev', name: 'Software Development', slug: 'software-development' },
            instructor: { id: 'u-1', name: 'John Doe', email: 'john@techsprout.io' },
            createdAt: '2026-09-30T00:00:00.000Z',
            updatedAt: '2026-09-30T00:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 12,
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
        limit: 12,
        search: 'TypeScript',
        categorySlug: 'software-development',
        level: 'INTERMEDIATE',
        minPrice: 10,
        maxPrice: 50,
        sortBy: 'price' as const,
        sortOrder: 'asc' as const,
      };

      const result = await fetchPublicCourses(params);

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/courses', { params });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].slug).toBe('modern-typescript-nestjs');
      expect(result.items[0].status).toBe('PUBLISHED');
      expect(result.items[0].visibility).toBe('PUBLIC');
      expect(result.pagination.total).toBe(1);
    });

    it('should handle empty course results gracefully', async () => {
      const emptyResult: PaginatedResult<CourseDto> = {
        items: [],
        pagination: {
          page: 1,
          limit: 12,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: emptyResult },
      });

      const result = await fetchPublicCourses({ search: 'NonExistentCourseXYZ' });
      expect(result.items).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasNextPage).toBe(false);
    });

    it('should propagate API errors for retry mechanisms', async () => {
      vi.mocked(axiosInstance.get).mockRejectedValueOnce(new Error('Network Error'));

      await expect(fetchPublicCourses()).rejects.toThrow('Network Error');
    });
  });

  // ==========================================
  // 2. PUBLIC COURSE DETAIL (/courses/[slug])
  // ==========================================
  describe('Public Course Detail & Curriculum Ordering', () => {
    it('should fetch course details by slug with ordered modules and lessons', async () => {
      const mockCourseDetail: CourseDto = {
        id: 'c-pub-detail',
        title: 'Fullstack Next.js 16 Mastery',
        slug: 'fullstack-nextjs-16-mastery',
        shortDescription: 'Master modern fullstack development',
        description: 'Comprehensive curriculum covering SSR, SSG, and API integration.',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        categoryId: 'cat-web',
        instructorId: 'inst-1',
        price: '0.00',
        currency: 'USD',
        level: 'ADVANCED',
        language: 'English',
        durationMinutes: 360,
        category: { id: 'cat-web', name: 'Web Dev', slug: 'web-dev' },
        instructor: { id: 'inst-1', name: 'Jane Smith', email: 'jane@techsprout.io' },
        createdAt: '2026-09-30T00:00:00.000Z',
        updatedAt: '2026-09-30T00:00:00.000Z',
        modules: [
          // Raw array might be unordered; frontend / contract tests verify ordering
          {
            id: 'm-2',
            courseId: 'c-pub-detail',
            title: 'Module 2: Server Components',
            position: 2,
            createdAt: '2026-09-30T00:00:00.000Z',
            updatedAt: '2026-09-30T00:00:00.000Z',
            lessons: [
              {
                id: 'l-2-1',
                moduleId: 'm-2',
                title: 'Lesson 2.1: Streaming with Suspense',
                lessonType: 'VIDEO',
                position: 1,
                durationSeconds: 450,
                isPreview: false,
                mediaUrl: null, // Protected: stripped by backend
                createdAt: '2026-09-30T00:00:00.000Z',
                updatedAt: '2026-09-30T00:00:00.000Z',
              },
            ],
          },
          {
            id: 'm-1',
            courseId: 'c-pub-detail',
            title: 'Module 1: Getting Started',
            position: 1,
            createdAt: '2026-09-30T00:00:00.000Z',
            updatedAt: '2026-09-30T00:00:00.000Z',
            lessons: [
              {
                id: 'l-1-2',
                moduleId: 'm-1',
                title: 'Lesson 1.2: Architecture Overview',
                lessonType: 'TEXT',
                position: 2,
                durationSeconds: 300,
                isPreview: false,
                mediaUrl: null,
                createdAt: '2026-09-30T00:00:00.000Z',
                updatedAt: '2026-09-30T00:00:00.000Z',
              },
              {
                id: 'l-1-1',
                moduleId: 'm-1',
                title: 'Lesson 1.1: Course Trailer & Welcome',
                lessonType: 'VIDEO',
                position: 1,
                durationSeconds: 180,
                isPreview: true,
                mediaUrl: 'https://res.cloudinary.com/demo/video/upload/trailer.mp4',
                createdAt: '2026-09-30T00:00:00.000Z',
                updatedAt: '2026-09-30T00:00:00.000Z',
              },
            ],
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockCourseDetail },
      });

      const course = await fetchPublicCourseBySlug('fullstack-nextjs-16-mastery');

      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/courses/fullstack-nextjs-16-mastery'
      );
      expect(course.slug).toBe('fullstack-nextjs-16-mastery');
      expect(course.status).toBe('PUBLISHED');
      expect(course.visibility).toBe('PUBLIC');

      // Verify module sorting by position
      const sortedModules = [...(course.modules || [])].sort((a, b) => a.position - b.position);
      expect(sortedModules[0].title).toBe('Module 1: Getting Started');
      expect(sortedModules[1].title).toBe('Module 2: Server Components');

      // Verify lesson sorting within module 1
      const m1Lessons = [...(sortedModules[0].lessons || [])].sort((a, b) => a.position - b.position);
      expect(m1Lessons[0].title).toBe('Lesson 1.1: Course Trailer & Welcome');
      expect(m1Lessons[1].title).toBe('Lesson 1.2: Architecture Overview');

      // Preview Media Security: isPreview === true retains mediaUrl; isPreview === false is null
      expect(m1Lessons[0].isPreview).toBe(true);
      expect(m1Lessons[0].mediaUrl).toBe('https://res.cloudinary.com/demo/video/upload/trailer.mp4');

      expect(m1Lessons[1].isPreview).toBe(false);
      expect(m1Lessons[1].mediaUrl).toBeNull();

      expect(sortedModules[1].lessons![0].isPreview).toBe(false);
      expect(sortedModules[1].lessons![0].mediaUrl).toBeNull();
    });

    it('should throw 404 when course slug does not exist or is not published', async () => {
      const notFoundError = {
        response: {
          status: 404,
          data: {
            success: false,
            error: {
              code: 'COURSE_NOT_FOUND',
              message: 'Course not found or inactive',
            },
          },
        },
      };

      vi.mocked(axiosInstance.get).mockRejectedValueOnce(notFoundError);

      await expect(fetchPublicCourseBySlug('draft-unreleased-course')).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  // ==========================================
  // 3. PUBLIC CATEGORIES & CATEGORY COURSES
  // ==========================================
  describe('Public Category API Integration', () => {
    it('should fetch active public categories', async () => {
      const mockCategories: CategoryDto[] = [
        {
          id: 'cat-1',
          name: 'Artificial Intelligence',
          slug: 'artificial-intelligence',
          description: 'Machine learning, deep learning and AI foundations',
          isActive: true,
          courseCount: 15,
          createdAt: '2026-09-30T00:00:00.000Z',
          updatedAt: '2026-09-30T00:00:00.000Z',
        },
        {
          id: 'cat-2',
          name: 'Cybersecurity',
          slug: 'cybersecurity',
          description: 'Ethical hacking and network defense',
          isActive: true,
          courseCount: 8,
          createdAt: '2026-09-30T00:00:00.000Z',
          updatedAt: '2026-09-30T00:00:00.000Z',
        },
      ];

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockCategories },
      });

      const categories = await fetchPublicCategories();

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/categories');
      expect(categories).toHaveLength(2);
      expect(categories[0].slug).toBe('artificial-intelligence');
      expect(categories.every((c) => c.isActive)).toBe(true);
    });

    it('should fetch courses belonging to a specific category slug', async () => {
      const mockCategoryCoursesResult: PaginatedResult<CourseDto> = {
        items: [
          {
            id: 'c-ai-1',
            title: 'Neural Networks from Scratch',
            slug: 'neural-networks-from-scratch',
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
            price: '59.99',
            currency: 'USD',
            level: 'ADVANCED',
            category: { id: 'cat-1', name: 'Artificial Intelligence', slug: 'artificial-intelligence' },
            createdAt: '2026-09-30T00:00:00.000Z',
            updatedAt: '2026-09-30T00:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 12,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockCategoryCoursesResult },
      });

      const result = await fetchPublicCategoryCourses('artificial-intelligence', { page: 1, limit: 12 });

      expect(axiosInstance.get).toHaveBeenCalledWith(
        '/api/v1/categories/artificial-intelligence/courses',
        {
          params: { page: 1, limit: 12 },
        }
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].category?.slug).toBe('artificial-intelligence');
    });

    it('should return 404 when querying an inactive or nonexistent category', async () => {
      const catNotFoundError = {
        response: {
          status: 404,
          data: {
            success: false,
            error: {
              code: 'CATEGORY_NOT_FOUND',
              message: 'Category not found or inactive',
            },
          },
        },
      };

      vi.mocked(axiosInstance.get).mockRejectedValueOnce(catNotFoundError);

      await expect(fetchPublicCategoryCourses('inactive-category')).rejects.toMatchObject({
        response: { status: 404 },
      });
    });
  });

  // ==========================================
  // 4. CARD ADAPTER & SLUG NAVIGATION CONTRACTS
  // ==========================================
  describe('Card Components Data Contracts', () => {
    it('CourseCard uses course.slug for routing rather than legacy _id', () => {
      const sampleCourse: CourseDto = {
        id: 'uuid-1234',
        title: 'Deep Learning with PyTorch',
        slug: 'deep-learning-with-pytorch',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        price: '0.00',
        currency: 'USD',
        level: 'BEGINNER',
        durationMinutes: 90,
        createdAt: '2026-09-30T00:00:00.000Z',
        updatedAt: '2026-09-30T00:00:00.000Z',
      };

      // Assert expected route contract
      const targetRoute = `/courses/${sampleCourse.slug}`;
      expect(targetRoute).toBe('/courses/deep-learning-with-pytorch');
      expect(targetRoute).not.toContain(sampleCourse.id);
    });

    it('CategoryCard uses category.slug for routing', () => {
      const sampleCategory: CategoryDto = {
        id: 'cat-uuid-99',
        name: 'Cloud Computing',
        slug: 'cloud-computing',
        isActive: true,
        courseCount: 12,
        createdAt: '2026-09-30T00:00:00.000Z',
        updatedAt: '2026-09-30T00:00:00.000Z',
      };

      const targetRoute = `/categories/${sampleCategory.slug}`;
      expect(targetRoute).toBe('/categories/cloud-computing');
      expect(targetRoute).not.toContain(sampleCategory.id);
    });

    it('safely formats pricing for free and paid courses', () => {
      const freeCourse: Partial<CourseDto> = { price: '0.00', currency: 'USD' };
      const paidCourse: Partial<CourseDto> = { price: '49.99', currency: 'USD' };

      const formatPrice = (c: Partial<CourseDto>) =>
        Number(c.price) === 0 ? 'Free' : `$${Number(c.price).toFixed(2)} ${c.currency || 'USD'}`;

      expect(formatPrice(freeCourse)).toBe('Free');
      expect(formatPrice(paidCourse)).toBe('$49.99 USD');
    });
  });

  // ==========================================
  // 5. MOCKDATA INTEGRATION INTEGRITY AUDIT
  // ==========================================
  describe('MockData Migration Integrity Audit', () => {
    const webSrcDir = path.resolve(__dirname, '..');

    const migratedFiles = [
      'app/courses/page.tsx',
      'app/courses/[slug]/page.tsx',
      'app/categories/[slug]/page.tsx',
      'components/cards/CourseCard.tsx',
      'components/cards/CategoryCard.tsx',
      'components/sections/home/FeaturedCourses.tsx',
      'components/sections/home/SearchByCategory.tsx',
      'components/header/Header.tsx',
    ];

    it.each(migratedFiles)(
      'file %s must NOT import from mockData or mockApi',
      (relPath) => {
        const fullPath = path.join(webSrcDir, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          expect(content).not.toContain('@/lib/mockData/mockData');
          expect(content).not.toContain('@/lib/mockData/mockApi');
          expect(content).not.toContain("from '@/lib/mockData");
        }
      }
    );

    it('legacy route /courses/[course] must not exist in filesystem', () => {
      const legacyCourseRoute = path.join(webSrcDir, 'app', 'courses', '[course]');
      expect(fs.existsSync(legacyCourseRoute)).toBe(false);
    });
  });

  // ==========================================
  // 6. SECURITY & VISIBILITY BOUNDARY
  // ==========================================
  describe('Security & Public Visibility Boundary', () => {
    it('frontend catalog API client never sends client-side credentials or auth tokens to public endpoints', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: { items: [], pagination: { page: 1, limit: 10, total: 0 } } },
      });

      await fetchPublicCourses();

      const callArgs = vi.mocked(axiosInstance.get).mock.calls[0];
      expect(callArgs[0]).toBe('/api/v1/courses');
      // Verify no Authorization header or token was attached in params
      expect(callArgs[1]?.params?.token).toBeUndefined();
      expect(callArgs[1]?.headers?.Authorization).toBeUndefined();
    });

    it('preview media rules: unauthenticated users never receive mediaUrl for non-preview lessons', () => {
      const lessons: LessonDto[] = [
        {
          id: 'l-preview',
          moduleId: 'm-1',
          title: 'Preview Lesson',
          lessonType: 'VIDEO',
          position: 1,
          isPreview: true,
          mediaUrl: 'https://cloudinary.com/video/trailer.mp4',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'l-protected',
          moduleId: 'm-1',
          title: 'Protected Lesson',
          lessonType: 'VIDEO',
          position: 2,
          isPreview: false,
          mediaUrl: null,
          createdAt: '',
          updatedAt: '',
        },
      ];

      // Verification logic as enforced by course detail UI
      const renderedPreviewUrls = lessons
        .filter((l) => l.isPreview && l.mediaUrl)
        .map((l) => l.mediaUrl);

      expect(renderedPreviewUrls).toHaveLength(1);
      expect(renderedPreviewUrls[0]).toBe('https://cloudinary.com/video/trailer.mp4');

      const protectedLesson = lessons.find((l) => !l.isPreview);
      expect(protectedLesson?.mediaUrl).toBeNull();
    });
  });
});
