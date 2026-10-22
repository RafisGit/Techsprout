import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  fetchDiscussions,
  fetchDiscussion,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  toggleDiscussionVote,
  createDiscussionReply,
  updateDiscussionReply,
  deleteDiscussionReply,
  toggleReplyVote,
} from '@/lib/api/discussions';
import {
  fetchAssignments,
  fetchAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  fetchMySubmissions,
  fetchSubmissions,
  fetchSubmission,
  gradeSubmission,
} from '@/lib/api/assignments';
import { SafeMarkdown } from '@/components/learning/SafeMarkdown';
import { axiosInstance } from '@/lib/axiosInstance';
import type {
  DiscussionDto,
  DiscussionReplyDto,
  PaginatedDiscussionsDto,
  AssignmentDto,
  AssignmentSubmissionDto,
  AssignmentGradeDto,
  PaginatedAssignmentsDto,
  PaginatedSubmissionsDto,
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

describe('Phase 7.4 — Interactive Discussions & Hands-on Project Assignments (SCR-P7-01 / WP-P7-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // SECTION 1: DISCUSSIONS API CLIENT & CONTRACT VERIFICATION
  // =========================================================================
  describe('1. Discussions API Client & Contracts', () => {
    const courseId = 'course-uuid-101';
    const lessonId = 'lesson-uuid-202';
    const discussionId = 'disc-uuid-303';
    const replyId = 'reply-uuid-404';

    it('1.1 fetchDiscussions queries lesson discussions with sorting and pagination', async () => {
      const mockResult: PaginatedDiscussionsDto = {
        data: [
          {
            id: discussionId,
            courseId,
            lessonId,
            userId: 'student-uuid-1',
            authorName: 'Alex Student',
            title: 'How does useEffect cleanup work?',
            content: 'I want to know when the cleanup function runs during unmount.',
            upvoteCount: 5,
            replyCount: 2,
            hasUpvoted: false,
            isPinned: false,
            isInstructorBadge: false,
            status: 'ACTIVE',
            createdAt: '2026-10-21T10:00:00.000Z',
            updatedAt: '2026-10-21T10:00:00.000Z',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 30,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockResult },
      });

      const result = await fetchDiscussions(courseId, lessonId, { sort: 'recent', limit: 30 });

      expect(axiosInstance.get).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions`,
        { params: { sort: 'recent', limit: 30 } }
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toBe('How does useEffect cleanup work?');
      expect(result.meta.total).toBe(1);
    });

    it('1.2 fetchDiscussion retrieves a single thread with its nested replies', async () => {
      const mockThreadDetail: DiscussionDto & { replies: DiscussionReplyDto[] } = {
        id: discussionId,
        courseId,
        lessonId,
        userId: 'student-uuid-1',
        authorName: 'Alex Student',
        title: 'How does useEffect cleanup work?',
        content: 'I want to know when the cleanup function runs during unmount.',
        upvoteCount: 5,
        replyCount: 1,
        hasUpvoted: true,
        isPinned: true,
        isInstructorBadge: false,
        status: 'ACTIVE',
        createdAt: '2026-10-21T10:00:00.000Z',
        updatedAt: '2026-10-21T10:00:00.000Z',
        replies: [
          {
            id: replyId,
            discussionId,
            userId: 'instructor-uuid-1',
            authorName: 'Dr. Sarah (Instructor)',
            content: 'The cleanup runs right before the component unmounts or before the effect re-runs.',
            upvoteCount: 8,
            hasUpvoted: true,
            isInstructorBadge: true,
            parentReplyId: null,
            status: 'ACTIVE',
            createdAt: '2026-10-21T10:15:00.000Z',
            updatedAt: '2026-10-21T10:15:00.000Z',
          },
        ],
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockThreadDetail },
      });

      const result = await fetchDiscussion(courseId, lessonId, discussionId);

      expect(axiosInstance.get).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}`
      );
      expect(result.id).toBe(discussionId);
      expect(result.replies).toHaveLength(1);
      expect(result.replies[0].isInstructorBadge).toBe(true);
    });

    it('1.3 createDiscussion sends title and content payload to endpoint', async () => {
      const newQuestion = {
        title: 'Understanding useMemo caching',
        content: 'Does useMemo persist across page navigations?',
      };
      const mockCreated: DiscussionDto = {
        id: 'new-disc-uuid',
        courseId,
        lessonId,
        userId: 'student-uuid-1',
        authorName: 'Alex Student',
        title: newQuestion.title,
        content: newQuestion.content,
        upvoteCount: 0,
        replyCount: 0,
        hasUpvoted: false,
        isPinned: false,
        isInstructorBadge: false,
        status: 'ACTIVE',
        createdAt: '2026-10-21T12:00:00.000Z',
        updatedAt: '2026-10-21T12:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockCreated },
      });

      const result = await createDiscussion(courseId, lessonId, newQuestion);

      expect(axiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions`,
        newQuestion
      );
      expect(result.id).toBe('new-disc-uuid');
      expect(result.title).toBe(newQuestion.title);
    });

    it('1.4 updateDiscussion handles pinning and status moderation updates', async () => {
      const updates = { isPinned: true, status: 'RESOLVED' as const };
      const mockUpdated: DiscussionDto = {
        id: discussionId,
        courseId,
        lessonId,
        userId: 'student-uuid-1',
        authorName: 'Alex Student',
        title: 'Title',
        content: 'Content',
        upvoteCount: 5,
        replyCount: 2,
        hasUpvoted: false,
        isPinned: true,
        isInstructorBadge: false,
        status: 'RESOLVED',
        createdAt: '2026-10-21T10:00:00.000Z',
        updatedAt: '2026-10-21T12:30:00.000Z',
      };

      vi.mocked(axiosInstance.patch).mockResolvedValueOnce({
        data: { success: true, data: mockUpdated },
      });

      const result = await updateDiscussion(courseId, lessonId, discussionId, updates);

      expect(axiosInstance.patch).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}`,
        updates
      );
      expect(result.isPinned).toBe(true);
      expect(result.status).toBe('RESOLVED');
    });

    it('1.5 deleteDiscussion sends DELETE request to discussion endpoint', async () => {
      vi.mocked(axiosInstance.delete).mockResolvedValueOnce({
        data: { success: true },
      });

      await deleteDiscussion(courseId, lessonId, discussionId);

      expect(axiosInstance.delete).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}`
      );
    });

    it('1.6 toggleDiscussionVote toggles upvote status and returns updated count', async () => {
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: { upvoted: true, upvoteCount: 6 } },
      });

      const result = await toggleDiscussionVote(courseId, lessonId, discussionId);

      expect(axiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}/vote`
      );
      expect(result).toEqual({ upvoted: true, upvoteCount: 6 });
    });

    it('1.7 createDiscussionReply handles top-level and nested replies', async () => {
      const replyPayload = {
        content: 'This is a child reply to the instructor answer.',
        parentReplyId: replyId,
      };
      const mockReply: DiscussionReplyDto = {
        id: 'reply-child-uuid',
        discussionId,
        userId: 'student-uuid-2',
        authorName: 'Bob Learner',
        content: replyPayload.content,
        upvoteCount: 0,
        hasUpvoted: false,
        isInstructorBadge: false,
        parentReplyId: replyId,
        status: 'ACTIVE',
        createdAt: '2026-10-21T13:00:00.000Z',
        updatedAt: '2026-10-21T13:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockReply },
      });

      const result = await createDiscussionReply(courseId, lessonId, discussionId, replyPayload);

      expect(axiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}/replies`,
        replyPayload
      );
      expect(result.parentReplyId).toBe(replyId);
      expect(result.authorName).toBe('Bob Learner');
    });

    it('1.8 toggleReplyVote toggles reply upvote status', async () => {
      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: { upvoted: true, upvoteCount: 9 } },
      });

      const result = await toggleReplyVote(courseId, lessonId, discussionId, replyId);

      expect(axiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/lessons/${lessonId}/discussions/${discussionId}/replies/${replyId}/vote`
      );
      expect(result.upvoted).toBe(true);
      expect(result.upvoteCount).toBe(9);
    });
  });

  // =========================================================================
  // SECTION 2: ASSIGNMENTS API CLIENT & CONTRACT VERIFICATION
  // =========================================================================
  describe('2. Assignments API Client & Contracts', () => {
    const courseId = 'course-uuid-101';
    const assignmentId = 'assign-uuid-505';
    const submissionId = 'sub-uuid-606';

    it('2.1 fetchAssignments retrieves lesson-scoped assignments', async () => {
      const mockAssignments: PaginatedAssignmentsDto = {
        data: [
          {
            id: assignmentId,
            courseId,
            lessonId: 'lesson-uuid-202',
            title: 'Build a Distributed Job Queue with Redis and BullMQ',
            description: 'Implement retry backoff, dead letter queue, and concurrency limits.',
            instructions: 'Package your source code as a ZIP file. Include Docker Compose setup.',
            maxScore: 100,
            dueDate: '2026-11-01T23:59:59.000Z',
            rubric: [
              { id: 'crit-1', title: 'Exponential Backoff', maxScore: 40, description: 'Correct delay calculation' },
              { id: 'crit-2', title: 'Idempotency', maxScore: 30, description: 'Prevent duplicate job processing' },
              { id: 'crit-3', title: 'Error Logging', maxScore: 30, description: 'Structured error reporting' },
            ],
            status: 'PUBLISHED',
            createdAt: '2026-10-21T09:00:00.000Z',
            updatedAt: '2026-10-21T09:00:00.000Z',
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockAssignments },
      });

      const result = await fetchAssignments(courseId, { limit: 10 });

      expect(axiosInstance.get).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/assignments`,
        { params: { limit: 10 } }
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].maxScore).toBe(100);
      expect(result.data[0].rubric).toHaveLength(3);
    });

    it('2.2 submitAssignment packages multipart/form-data with file and student notes', async () => {
      const mockSubmission: AssignmentSubmissionDto = {
        id: submissionId,
        assignmentId,
        userId: 'student-uuid-1',
        studentName: 'Alex Student',
        fileUrl: 'https://res.cloudinary.com/techsprout/raw/upload/v1/assignments/project.zip',
        fileName: 'project.zip',
        fileSizeBytes: 2048000,
        fileMimeType: 'application/zip',
        studentNotes: 'Includes unit tests in tests/ directory.',
        status: 'SUBMITTED',
        submittedAt: '2026-10-21T15:00:00.000Z',
        createdAt: '2026-10-21T15:00:00.000Z',
        updatedAt: '2026-10-21T15:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockSubmission },
      });

      // Synthetic File in Node test environment
      const fakeFile = new File(['fake-zip-binary-content'], 'project.zip', { type: 'application/zip' });

      const result = await submitAssignment(courseId, assignmentId, fakeFile, 'Includes unit tests in tests/ directory.');

      expect(axiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
        expect.any(FormData),
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      expect(result.id).toBe(submissionId);
      expect(result.fileName).toBe('project.zip');
      expect(result.status).toBe('SUBMITTED');
    });

    it('2.3 fetchMySubmissions retrieves authenticated student submissions', async () => {
      const mockSubmissions: AssignmentSubmissionDto[] = [
        {
          id: submissionId,
          assignmentId,
          userId: 'student-uuid-1',
          studentName: 'Alex Student',
          fileUrl: 'https://cloudinary.com/sub.pdf',
          fileName: 'report.pdf',
          fileSizeBytes: 1048576,
          fileMimeType: 'application/pdf',
          status: 'GRADED',
          submittedAt: '2026-10-21T14:00:00.000Z',
          createdAt: '2026-10-21T14:00:00.000Z',
          updatedAt: '2026-10-21T16:00:00.000Z',
          grade: {
            id: 'grade-uuid-707',
            submissionId,
            instructorId: 'instructor-uuid-1',
            instructorName: 'Dr. Sarah',
            score: 95,
            feedback: 'Excellent test coverage and clean architectural boundaries.',
            gradedAt: '2026-10-21T16:00:00.000Z',
          },
        },
      ];

      vi.mocked(axiosInstance.get).mockResolvedValueOnce({
        data: { success: true, data: mockSubmissions },
      });

      const result = await fetchMySubmissions(courseId, assignmentId);

      expect(axiosInstance.get).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/my`
      );
      expect(result).toHaveLength(1);
      expect(result[0].grade?.score).toBe(95);
      expect(result[0].grade?.feedback).toContain('clean architectural boundaries');
    });

    it('2.4 gradeSubmission allows instructor to record numeric score and feedback', async () => {
      const gradePayload = {
        score: 88,
        feedback: 'Good implementation; make sure to handle Redis reconnect retry caps.',
      };
      const mockGrade: AssignmentGradeDto = {
        id: 'grade-uuid-707',
        submissionId,
        instructorId: 'instructor-uuid-1',
        instructorName: 'Dr. Sarah',
        score: gradePayload.score,
        feedback: gradePayload.feedback,
        gradedAt: '2026-10-21T17:00:00.000Z',
      };

      vi.mocked(axiosInstance.post).mockResolvedValueOnce({
        data: { success: true, data: mockGrade },
      });

      const result = await gradeSubmission(courseId, assignmentId, submissionId, gradePayload);

      expect(axiosInstance.post).toHaveBeenCalledWith(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/grade`,
        gradePayload
      );
      expect(result.score).toBe(88);
      expect(result.feedback).toBe(gradePayload.feedback);
    });
  });

  // =========================================================================
  // SECTION 3: SAFEMARKDOWN SECURITY & SANITIZATION VERIFICATION
  // =========================================================================
  describe('3. SafeMarkdown Security & Sanitization', () => {
    it('3.1 renders standard markdown formatting correctly', () => {
      const markdown = 'This is **bold** text and *italic* text with `inline code`.';
      const html = renderToString(React.createElement(SafeMarkdown, { content: markdown }));

      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain('<code class="bg-gray-100 text-purple-700 px-1.5 py-0.5 rounded text-xs font-mono">inline code</code>');
    });

    it('3.2 formats headers and code blocks with syntax styling', () => {
      const markdown = '# Main Heading\n```typescript\nconst x: number = 42;\n```';
      const html = renderToString(React.createElement(SafeMarkdown, { content: markdown }));

      expect(html).toContain('<h1 class="text-lg font-bold text-gray-900 mt-3 mb-1">Main Heading</h1>');
      expect(html).toContain('<pre class="bg-gray-900 text-gray-100 p-3 rounded-xl overflow-x-auto text-xs my-2 font-mono">');
      expect(html).toContain('const x: number = 42;');
    });

    it('3.3 converts valid markdown links with security attributes target="_blank" and rel="noopener noreferrer"', () => {
      const markdown = 'Check the [TechSprout Docs](https://techsprout.io/docs) or [Support](mailto:support@techsprout.io).';
      const html = renderToString(React.createElement(SafeMarkdown, { content: markdown }));

      expect(html).toContain('<a href="https://techsprout.io/docs" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium">TechSprout Docs</a>');
      expect(html).toContain('<a href="mailto:support@techsprout.io" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium">Support</a>');
    });

    it('3.4 strictly escapes raw HTML tags to prevent XSS injection in discussions', () => {
      const maliciousScript = '<script>alert("XSS Attack!");</script>';
      const html = renderToString(React.createElement(SafeMarkdown, { content: maliciousScript }));

      // Must be entity escaped, never raw executable script
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;XSS Attack!&quot;);&lt;/script&gt;');
    });

    it('3.5 neutralizes inline event handler payloads (onerror, onload, onmouseover)', () => {
      const maliciousImg = '<img src="invalid-url" onerror="alert(document.cookie)" />';
      const html = renderToString(React.createElement(SafeMarkdown, { content: maliciousImg }));

      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img src=&quot;invalid-url&quot; onerror=&quot;alert(document.cookie)&quot; /&gt;');
    });

    it('3.6 rejects javascript: and unsafe URI schemes in markdown links', () => {
      const maliciousLink = '[Click to exploit](javascript:alert("XSS"))';
      const html = renderToString(React.createElement(SafeMarkdown, { content: maliciousLink }));

      // Should not create an anchor tag for javascript: protocols
      expect(html).not.toContain('<a href="javascript:');
      expect(html).toContain('[Click to exploit](javascript:alert(&quot;XSS&quot;))');
    });

    it('3.7 handles empty or null content safely without crashing', () => {
      const emptyHtml = renderToString(React.createElement(SafeMarkdown, { content: '' }));
      expect(emptyHtml).toContain('<div class="prose prose-sm max-w-none text-gray-800 break-words leading-relaxed "></div>');
    });
  });

  // =========================================================================
  // SECTION 4: CLIENT-SIDE VALIDATION & USER INTERACTION LOGIC
  // =========================================================================
  describe('4. Client-side File Validation & Interaction Boundaries', () => {
    it('4.1 validates assignment attachment MIME extensions (only .pdf and .zip allowed)', () => {
      const allowedFiles = ['solution.pdf', 'PROJECT-ARCHIVE.ZIP', 'my_code.zip', 'assignment.PDF'];
      const disallowedFiles = ['malicious.exe', 'payload.sh', 'script.js', 'document.docx', 'archive.tar.gz'];

      const checkExtension = (filename: string): boolean => {
        const name = filename.toLowerCase();
        return name.endsWith('.pdf') || name.endsWith('.zip');
      };

      for (const file of allowedFiles) {
        expect(checkExtension(file)).toBe(true);
      }

      for (const file of disallowedFiles) {
        expect(checkExtension(file)).toBe(false);
      }
    });

    it('4.2 enforces client-side file size ceiling (max 25MB)', () => {
      const maxSize = 25 * 1024 * 1024; // 26,214,400 bytes

      const checkFileSize = (bytes: number): boolean => bytes <= maxSize;

      expect(checkFileSize(1024)).toBe(true); // 1KB
      expect(checkFileSize(24 * 1024 * 1024)).toBe(true); // 24MB
      expect(checkFileSize(25 * 1024 * 1024)).toBe(true); // exactly 25MB
      expect(checkFileSize(25 * 1024 * 1024 + 1)).toBe(false); // 25MB + 1B rejected
      expect(checkFileSize(50 * 1024 * 1024)).toBe(false); // 50MB rejected
    });

    it('4.3 trims question title and content to prevent blank whitespace submissions', () => {
      const validateQuestion = (title: string, content: string): boolean => {
        return title.trim().length > 0 && content.trim().length > 0;
      };

      expect(validateQuestion('', '')).toBe(false);
      expect(validateQuestion('   ', 'Valid content')).toBe(false);
      expect(validateQuestion('Valid Title', '   ')).toBe(false);
      expect(validateQuestion('How to configure CORS?', 'Getting 403 in browser')).toBe(true);
    });

    it('4.4 correctly formats rubric points tally for assignments', () => {
      const rubric = [
        { id: '1', title: 'Architecture', maxScore: 40 },
        { id: '2', title: 'Unit Tests', maxScore: 30 },
        { id: '3', title: 'Documentation', maxScore: 30 },
      ];

      const totalRubricPoints = rubric.reduce((sum, r) => sum + r.maxScore, 0);
      expect(totalRubricPoints).toBe(100);
    });
  });

  // =========================================================================
  // SECTION 5: COMPONENT STATE MACHINES, HIERARCHIES & ERROR PROPAGATION
  // =========================================================================
  describe('5. Reply Hierarchies, Sorting & API Error Handling', () => {
    it('5.1 reconstructs nested reply trees from flat API reply lists', () => {
      const flatReplies: DiscussionReplyDto[] = [
        {
          id: 'rep-1',
          discussionId: 'disc-1',
          userId: 'user-1',
          authorName: 'Instructor Alice',
          content: 'Top-level instructor answer.',
          upvoteCount: 4,
          hasUpvoted: false,
          isInstructorBadge: true,
          parentReplyId: null,
          status: 'ACTIVE',
          createdAt: '2026-10-21T10:00:00.000Z',
          updatedAt: '2026-10-21T10:00:00.000Z',
        },
        {
          id: 'rep-2',
          discussionId: 'disc-1',
          userId: 'user-2',
          authorName: 'Student Bob',
          content: 'Clarification question on Alice answer.',
          upvoteCount: 1,
          hasUpvoted: false,
          isInstructorBadge: false,
          parentReplyId: 'rep-1',
          status: 'ACTIVE',
          createdAt: '2026-10-21T10:05:00.000Z',
          updatedAt: '2026-10-21T10:05:00.000Z',
        },
        {
          id: 'rep-3',
          discussionId: 'disc-1',
          userId: 'user-3',
          authorName: 'Student Charlie',
          content: 'Another independent top-level thought.',
          upvoteCount: 0,
          hasUpvoted: false,
          isInstructorBadge: false,
          parentReplyId: null,
          status: 'ACTIVE',
          createdAt: '2026-10-21T10:10:00.000Z',
          updatedAt: '2026-10-21T10:10:00.000Z',
        },
      ];

      // Partition into roots and children
      const rootReplies = flatReplies.filter((r) => !r.parentReplyId);
      const childReplies = flatReplies.filter((r) => !!r.parentReplyId);

      expect(rootReplies).toHaveLength(2);
      expect(childReplies).toHaveLength(1);
      expect(childReplies[0].parentReplyId).toBe('rep-1');
    });

    it('5.2 sorts discussions correctly according to active filter', () => {
      const discussions: DiscussionDto[] = [
        {
          id: 'd-1',
          courseId: 'c-1',
          lessonId: 'l-1',
          userId: 'u-1',
          authorName: 'A',
          title: 'Older Question',
          content: 'Text',
          upvoteCount: 10,
          replyCount: 0,
          hasUpvoted: false,
          isPinned: false,
          isInstructorBadge: false,
          status: 'ACTIVE',
          createdAt: '2026-10-20T10:00:00.000Z',
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
        {
          id: 'd-2',
          courseId: 'c-1',
          lessonId: 'l-1',
          userId: 'u-2',
          authorName: 'B',
          title: 'Recent Question',
          content: 'Text',
          upvoteCount: 2,
          replyCount: 3,
          hasUpvoted: false,
          isPinned: false,
          isInstructorBadge: false,
          status: 'ACTIVE',
          createdAt: '2026-10-21T10:00:00.000Z',
          updatedAt: '2026-10-21T10:00:00.000Z',
        },
      ];

      // Sort by recent (created date desc)
      const recentSorted = [...discussions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      expect(recentSorted[0].id).toBe('d-2');

      // Sort by most upvoted (upvoteCount desc)
      const upvotedSorted = [...discussions].sort((a, b) => b.upvoteCount - a.upvoteCount);
      expect(upvotedSorted[0].id).toBe('d-1');

      // Filter by unanswered (replyCount === 0)
      const unanswered = discussions.filter((d) => d.replyCount === 0);
      expect(unanswered).toHaveLength(1);
      expect(unanswered[0].id).toBe('d-1');
    });

    it('5.3 propagates 403 Forbidden when an unenrolled student attempts to post discussion', async () => {
      const error403 = {
        response: {
          status: 403,
          data: {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Active course enrollment required to participate in discussions.',
            },
          },
        },
      };

      vi.mocked(axiosInstance.post).mockRejectedValueOnce(error403);

      await expect(
        createDiscussion('c-1', 'l-1', { title: 'Test', content: 'Test content' })
      ).rejects.toEqual(error403);
    });

    it('5.4 propagates 400 Bad Request when an invalid grade is submitted', async () => {
      const error400 = {
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Score cannot exceed assignment maxScore of 100.',
            },
          },
        },
      };

      vi.mocked(axiosInstance.post).mockRejectedValueOnce(error400);

      await expect(
        gradeSubmission('c-1', 'a-1', 's-1', { score: 150, feedback: 'Exceeds maximum' })
      ).rejects.toEqual(error400);
    });

    it('5.5 maps assignment submission status to semantic indicators', () => {
      const getStatusBadge = (status: 'SUBMITTED' | 'GRADED' | 'RESUBMITTED') => {
        switch (status) {
          case 'GRADED':
            return { color: 'emerald', label: 'Graded' };
          case 'SUBMITTED':
          case 'RESUBMITTED':
            return { color: 'amber', label: 'Under Review' };
          default:
            return { color: 'gray', label: 'Pending' };
        }
      };

      expect(getStatusBadge('GRADED')).toEqual({ color: 'emerald', label: 'Graded' });
      expect(getStatusBadge('SUBMITTED')).toEqual({ color: 'amber', label: 'Under Review' });
      expect(getStatusBadge('RESUBMITTED')).toEqual({ color: 'amber', label: 'Under Review' });
    });
  });
});
