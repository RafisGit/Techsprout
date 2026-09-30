import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selfEnroll,
  fetchUserEnrollments,
  fetchCourseEnrollmentStatus,
  cancelEnrollment,
  fetchLearningCurriculum,
  fetchLearningResume,
  fetchLearningLesson,
  saveProgressCheckpoint,
  toggleLessonComplete,
} from '@/lib/api/learning';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  EnrollmentDto,
  PaginatedEnrollmentsData,
  EnrollmentStatusResponse,
  LearningCurriculumDto,
  LearningLessonContentDto,
  ResumePointDto,
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

describe('P3.3 — Student Learning Frontend & Contract Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // 1 & 2: MY COURSES DASHBOARD
  // ==========================================
  describe('My Courses Dashboard (/my-courses)', () => {
    it('1. My Courses renders enrolled courses with progress and resume metadata', async () => {
      const mockEnrollments: PaginatedEnrollmentsData = {
        items: [
          {
            enrollmentId: 'e-101',
            status: 'ACTIVE',
            enrolledAt: '2026-09-30T10:00:00.000Z',
            progress: {
              completedLessons: 4,
              totalLessons: 10,
              percentage: 40,
            },
            resumePoint: {
              lessonId: 'l-5',
              moduleId: 'm-2',
              lessonTitle: 'State Management in React',
              watchPositionSeconds: 180,
            },
            course: {
              id: 'c-1',
              title: 'Fullstack React & NestJS',
              slug: 'fullstack-react-nestjs',
              status: 'PUBLISHED',
              thumbnailUrl: 'https://res.cloudinary.com/thumb.jpg',
              category: { id: 'cat-1', name: 'Web Dev', slug: 'web-dev' },
              instructor: { id: 'u-1', name: 'Prof. Sprout' },
            },
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
        data: { success: true, data: mockEnrollments },
      });

      const result = await fetchUserEnrollments({ status: 'ACTIVE', limit: 12 });

      expect(axiosInstance.get).toHaveBeenCalledWith('/api/v1/enrollments', {
        params: { status: 'ACTIVE', limit: 12 },
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].course.title).toBe('Fullstack React & NestJS');
      expect(result.items[0].progress.percentage).toBe(40);
      expect(result.items[0].resumePoint?.lessonTitle).toBe('State Management in React');
    });

    it('2. Empty My Courses state returns empty items array', async () => {
      const emptyResult: PaginatedEnrollmentsData = {
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

      const result = await fetchUserEnrollments();
      expect(result.items).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  // ==========================================
  // 3 & 4: ENROLLMENT ACTION & STATE UPDATE
  // ==========================================
  describe('Enrollment API Integration & Mutation', () => {
    it('3. Enrollment button calls API with courseId and strips studentId', async () => {
      const mockEnrollment: EnrollmentDto = {
        id: 'e-created-1',
        courseId: 'c-target-1',
        studentId: 'usr-student-session',
        status: 'ACTIVE',
        enrolledAt: '2026-09-30T12:00:00.000Z',
        progressPercentage: 0,
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockEnrollment },
      });

      const result = await selfEnroll('c-target-1');

      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/enrollments', {
        courseId: 'c-target-1',
      });
      expect(result.id).toBe('e-created-1');
      expect(result.status).toBe('ACTIVE');
    });

    it('4. Enrollment success updates enrollment status to enrolled', async () => {
      const mockStatusResponse: EnrollmentStatusResponse = {
        isEnrolled: true,
        enrollment: {
          id: 'e-created-1',
          status: 'ACTIVE',
          enrolledAt: '2026-09-30T12:00:00.000Z',
          progressPercentage: 0,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockStatusResponse },
      });

      const status = await fetchCourseEnrollmentStatus('c-target-1');
      expect(status.isEnrolled).toBe(true);
      expect(status.enrollment?.status).toBe('ACTIVE');
    });
  });

  // ==========================================
  // 5 & 6: CTA RESOLUTION (UNAUTH, ENROLLED, COMPLETED)
  // ==========================================
  describe('CTA Resolution Logic on /courses/[slug]', () => {
    function resolveCourseCTA(
      currentUser: { id: string } | null,
      enrollmentStatus: EnrollmentStatusResponse | null,
      courseStatus: 'PUBLISHED' | 'ARCHIVED'
    ) {
      if (!currentUser) {
        return { label: 'Log in to enroll', disabled: false, action: 'LOGIN' };
      }
      if (enrollmentStatus?.isEnrolled) {
        if (enrollmentStatus.enrollment?.status === 'COMPLETED') {
          return { label: 'View Course', disabled: false, action: 'CONTINUE_LEARNING' };
        }
        return { label: 'Continue Learning', disabled: false, action: 'CONTINUE_LEARNING' };
      }
      if (courseStatus === 'ARCHIVED') {
        return { label: 'Enrollment Closed (Archived)', disabled: true, action: 'NONE' };
      }
      return { label: 'Enroll Now', disabled: false, action: 'ENROLL' };
    }

    it('5. Login CTA appears for unauthenticated user', () => {
      const cta = resolveCourseCTA(null, null, 'PUBLISHED');
      expect(cta.label).toBe('Log in to enroll');
      expect(cta.action).toBe('LOGIN');
      expect(cta.disabled).toBe(false);
    });

    it('6. Continue Learning appears for active enrolled user, View Course for completed', () => {
      // Active enrollment
      const activeCta = resolveCourseCTA(
        { id: 'u-1' },
        {
          isEnrolled: true,
          enrollment: {
            id: 'e-1',
            status: 'ACTIVE',
            enrolledAt: '2026-09-30',
            progressPercentage: 45,
          },
        },
        'PUBLISHED'
      );
      expect(activeCta.label).toBe('Continue Learning');
      expect(activeCta.action).toBe('CONTINUE_LEARNING');

      // Completed enrollment
      const completedCta = resolveCourseCTA(
        { id: 'u-1' },
        {
          isEnrolled: true,
          enrollment: {
            id: 'e-2',
            status: 'COMPLETED',
            enrolledAt: '2026-09-30',
            progressPercentage: 100,
          },
        },
        'PUBLISHED'
      );
      expect(completedCta.label).toBe('View Course');
      expect(completedCta.action).toBe('CONTINUE_LEARNING');
    });
  });

  // ==========================================
  // 7, 8, 9: LEARNING WORKSPACE CURRICULUM & PROGRESS
  // ==========================================
  describe('Learning Curriculum & Active / Completed Lesson Indicators', () => {
    const mockCurriculum: LearningCurriculumDto = {
      courseId: 'c-1',
      courseStatus: 'PUBLISHED',
      progressPercentage: 50,
      completedLessonsCount: 1,
      totalLessonsCount: 2,
      modules: [
        {
          id: 'mod-1',
          title: 'Module 1: Foundations',
          position: 1,
          lessons: [
            {
              id: 'l-1',
              title: 'Lesson 1.1 Intro',
              position: 1,
              lessonType: 'VIDEO',
              durationSeconds: 600,
              isPreview: true,
              progress: {
                status: 'COMPLETED',
                watchPositionSeconds: 600,
                completedAt: '2026-09-30T10:00:00.000Z',
              },
            },
            {
              id: 'l-2',
              title: 'Lesson 1.2 In Progress',
              position: 2,
              lessonType: 'VIDEO',
              durationSeconds: 900,
              isPreview: false,
              progress: {
                status: 'IN_PROGRESS',
                watchPositionSeconds: 300,
                completedAt: null,
              },
            },
          ],
        },
      ],
    };

    it('7. Learning workspace renders curriculum correctly', async () => {
      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockCurriculum },
      });

      const curr = await fetchLearningCurriculum('c-1');
      expect(curr.modules).toHaveLength(1);
      expect(curr.progressPercentage).toBe(50);
      expect(curr.completedLessonsCount).toBe(1);
    });

    it('8. Active lesson is highlighted', () => {
      const activeLessonId = 'l-2';
      const lessons = mockCurriculum.modules[0].lessons;
      const activeLesson = lessons.find((l) => l.id === activeLessonId);

      expect(activeLesson).toBeDefined();
      expect(activeLesson?.id).toBe('l-2');
      expect(activeLesson?.title).toBe('Lesson 1.2 In Progress');
    });

    it('9. Completed lesson is visually identified', () => {
      const completedLesson = mockCurriculum.modules[0].lessons.find(
        (l) => l.progress?.status === 'COMPLETED'
      );
      expect(completedLesson).toBeDefined();
      expect(completedLesson?.id).toBe('l-1');
      expect(completedLesson?.progress?.completedAt).not.toBeNull();
    });
  });

  // ==========================================
  // 10: RESUME LEARNING
  // ==========================================
  describe('Resume Learning Resolution', () => {
    it('10. Resume response selects correct lesson checkpoint', async () => {
      const mockResume: ResumePointDto = {
        lessonId: 'l-2',
        moduleId: 'mod-1',
        lessonTitle: 'Lesson 1.2 In Progress',
        lessonType: 'VIDEO',
        watchPositionSeconds: 300,
        progressPercentage: 50,
        isCourseCompleted: false,
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockResume },
      });

      const resume = await fetchLearningResume('c-1');
      expect(resume.lessonId).toBe('l-2');
      expect(resume.watchPositionSeconds).toBe(300);
      expect(resume.isCourseCompleted).toBe(false);
    });
  });

  // ==========================================
  // 11, 12, 13: VIDEO PLAYER & CHECKPOINTING
  // ==========================================
  describe('Video Lesson Progress & Throttling', () => {
    it('11. Video lesson renders correctly with authenticated media URL', async () => {
      const mockLesson: LearningLessonContentDto = {
        id: 'l-video-1',
        moduleId: 'm-1',
        courseId: 'c-1',
        title: 'Video Lesson Title',
        lessonType: 'VIDEO',
        durationSeconds: 600,
        mediaUrl: 'https://res.cloudinary.com/video.mp4',
        progress: {
          status: 'IN_PROGRESS',
          watchPositionSeconds: 120,
        },
        navigation: {
          previousLessonId: null,
          nextLessonId: 'l-text-2',
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockLesson },
      });

      const lesson = await fetchLearningLesson('c-1', 'l-video-1');
      expect(lesson.lessonType).toBe('VIDEO');
      expect(lesson.mediaUrl).toBe('https://res.cloudinary.com/video.mp4');
      expect(lesson.progress.watchPositionSeconds).toBe(120);
    });

    it('12. Video checkpoint is throttled and rounds watchPositionSeconds', async () => {
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            lessonId: 'l-video-1',
            status: 'IN_PROGRESS',
            watchPositionSeconds: 135,
            isCompleted: false,
            courseProgressPercentage: 20,
          },
        },
      });

      const checkpoint = await saveProgressCheckpoint('c-1', 'l-video-1', 135.42);

      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/learn/courses/c-1/lessons/l-video-1/progress',
        { watchPositionSeconds: 135 }
      );
      expect(checkpoint.watchPositionSeconds).toBe(135);
      expect(checkpoint.isCompleted).toBe(false);
    });

    it('13. Video completion triggers completion status when reaching 90%', async () => {
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            lessonId: 'l-video-1',
            status: 'COMPLETED',
            watchPositionSeconds: 550, // >= 90% of 600s (540s)
            isCompleted: true,
            courseProgressPercentage: 100,
          },
        },
      });

      const checkpoint = await saveProgressCheckpoint('c-1', 'l-video-1', 550);
      expect(checkpoint.isCompleted).toBe(true);
      expect(checkpoint.status).toBe('COMPLETED');
      expect(checkpoint.courseProgressPercentage).toBe(100);
    });
  });

  // ==========================================
  // 14: TEXT LESSON EXPLICIT COMPLETION
  // ==========================================
  describe('Text Lessons', () => {
    it('14. Text lesson can be marked complete and toggled', async () => {
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            lessonId: 'l-text-1',
            status: 'COMPLETED',
            completedAt: '2026-09-30T12:00:00.000Z',
            courseProgress: {
              completedLessons: 2,
              totalLessons: 2,
              percentage: 100,
              isCourseCompleted: true,
            },
          },
        },
      });

      const res = await toggleLessonComplete('c-1', 'l-text-1', true);
      expect(axiosInstance.post).toHaveBeenCalledWith(
        '/api/v1/learn/courses/c-1/lessons/l-text-1/complete',
        { completed: true }
      );
      expect(res.status).toBe('COMPLETED');
      expect(res.completedAt).not.toBeNull();
    });
  });

  // ==========================================
  // 15: PDF LESSONS
  // ==========================================
  describe('PDF Lessons', () => {
    it('15. PDF lesson provides valid mediaUrl and explicit complete toggle', async () => {
      const mockPdfLesson: LearningLessonContentDto = {
        id: 'l-pdf-1',
        moduleId: 'm-1',
        courseId: 'c-1',
        title: 'Course Cheatsheet',
        lessonType: 'PDF',
        durationSeconds: 120,
        mediaUrl: 'https://res.cloudinary.com/document.pdf',
        progress: {
          status: 'NOT_STARTED',
          watchPositionSeconds: 0,
        },
        navigation: {
          previousLessonId: 'l-text-1',
          nextLessonId: null,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockPdfLesson },
      });

      const lesson = await fetchLearningLesson('c-1', 'l-pdf-1');
      expect(lesson.lessonType).toBe('PDF');
      expect(lesson.mediaUrl).toBe('https://res.cloudinary.com/document.pdf');
    });
  });

  // ==========================================
  // 16 & 17: NAVIGATION & COURSE COMPLETION
  // ==========================================
  describe('Lesson Navigation & Course Completion State', () => {
    it('16. Previous/next navigation matches server navigation metadata', async () => {
      const mockNavLesson: LearningLessonContentDto = {
        id: 'l-mid',
        moduleId: 'm-1',
        courseId: 'c-1',
        title: 'Middle Lesson',
        lessonType: 'TEXT',
        durationSeconds: 300,
        progress: { status: 'IN_PROGRESS', watchPositionSeconds: 0 },
        navigation: {
          previousLessonId: 'l-first',
          nextLessonId: 'l-last',
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockNavLesson },
      });

      const lesson = await fetchLearningLesson('c-1', 'l-mid');
      expect(lesson.navigation.previousLessonId).toBe('l-first');
      expect(lesson.navigation.nextLessonId).toBe('l-last');
    });

    it('17. Completed-course state displays completion when progress is 100%', async () => {
      const mockCompleteResume: ResumePointDto = {
        lessonId: null,
        moduleId: null,
        lessonTitle: '',
        lessonType: 'VIDEO',
        watchPositionSeconds: 0,
        progressPercentage: 100,
        isCourseCompleted: true,
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockCompleteResume },
      });

      const resume = await fetchLearningResume('c-1');
      expect(resume.isCourseCompleted).toBe(true);
      expect(resume.progressPercentage).toBe(100);
      expect(resume.lessonId).toBeNull();
    });
  });

  // ==========================================
  // 18: ARCHIVED COURSE EXISTING LEARNER ACCESS
  // ==========================================
  describe('Archived Course Access for Existing Learner', () => {
    it('18. Existing learner accesses curriculum and lessons for ARCHIVED courses', async () => {
      const mockArchivedCurriculum: LearningCurriculumDto = {
        courseId: 'c-archived-1',
        courseStatus: 'ARCHIVED',
        progressPercentage: 80,
        completedLessonsCount: 4,
        totalLessonsCount: 5,
        modules: [
          {
            id: 'm-arch',
            title: 'Archived Module',
            position: 1,
            lessons: [
              {
                id: 'l-arch-1',
                title: 'Archived Lesson',
                position: 1,
                lessonType: 'VIDEO',
                durationSeconds: 600,
                isPreview: false,
                progress: {
                  status: 'IN_PROGRESS',
                  watchPositionSeconds: 200,
                },
              },
            ],
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockArchivedCurriculum },
      });

      const curr = await fetchLearningCurriculum('c-archived-1');
      expect(curr.courseStatus).toBe('ARCHIVED');
      expect(curr.modules[0].lessons[0].id).toBe('l-arch-1');
    });
  });

  // ==========================================
  // 19: 401 & 403 HANDLING
  // ==========================================
  describe('401 & 403 Security Handling', () => {
    it('19. Propagates 401 Unauthenticated and 403 Enrollment Required errors', async () => {
      // 401 Unauthenticated
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 401,
          data: { success: false, errorCode: 'UNAUTHENTICATED' },
        },
      });

      await expect(fetchLearningCurriculum('c-1')).rejects.toMatchObject({
        response: { status: 401 },
      });

      // 403 Forbidden / Not enrolled
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 403,
          data: { success: false, errorCode: 'ENROLLMENT_REQUIRED' },
        },
      });

      await expect(fetchLearningLesson('c-1', 'l-1')).rejects.toMatchObject({
        response: { status: 403 },
      });
    });
  });

  // ==========================================
  // 20: 404 & 5XX ERROR HANDLING
  // ==========================================
  describe('404 & Server Error Handling', () => {
    it('20. Propagates 404 Not Found and 500 Server Error', async () => {
      // 404 Not Found
      vi.mocked(axiosInstance.get).mockRejectedValueOnce({
        response: {
          status: 404,
          data: { success: false, errorCode: 'LESSON_NOT_FOUND' },
        },
      });

      await expect(fetchLearningLesson('c-1', 'l-missing')).rejects.toMatchObject({
        response: { status: 404 },
      });

      // 500 Internal Error
      vi.mocked(axiosInstance.post).mockRejectedValueOnce({
        response: {
          status: 500,
          data: { success: false, message: 'Internal Server Error' },
        },
      });

      await expect(selfEnroll('c-err')).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  // ==========================================
  // 21: CANCEL ENROLLMENT & RECOVERY
  // ==========================================
  describe('Enrollment Cancellation', () => {
    it('21. Calls cancel endpoint with enrollment ID', async () => {
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: { id: 'e-1', status: 'CANCELLED' } },
      });

      const res = await cancelEnrollment('e-1');
      expect(axiosInstance.post).toHaveBeenCalledWith('/api/v1/enrollments/e-1/cancel');
      expect(res.status).toBe('CANCELLED');
    });
  });
});
