import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscussionsService } from '../modules/discussions/discussions.service';
import { AssignmentsService } from '../modules/assignments/assignments.service';
import { AssignmentUploadService } from '../modules/assignments/assignment-upload.service';
import { AuditService } from '../modules/audit/audit.service';
import { CloudinaryService } from '../modules/media/cloudinary/cloudinary.service';
import { createTestDatabase } from './test-helper';
import {
  users,
  userRoles,
  roles,
  categories,
  courses,
  modules,
  lessons,
  enrollments,
  discussions,
  discussionReplies,
  discussionVotes,
  assignments,
  assignmentSubmissions,
  assignmentGrades,
} from '../database/schema';
import { eq, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import { ApiException } from '../common/errors/api-error';

describe('Phase 7.4: Interactive Course Discussions & Project Assignments Test Suite', () => {
  let db: any;
  let auditService: AuditService;
  let cloudinaryService: CloudinaryService;
  let uploadService: AssignmentUploadService;
  let discussionsService: DiscussionsService;
  let assignmentsService: AssignmentsService;

  let instructorId: string;
  let otherInstructorId: string;
  let studentAId: string;
  let studentBId: string;
  let nonEnrolledStudentId: string;
  let adminId: string;

  let categoryId: string;
  let courseId: string;
  let moduleId: string;
  let lessonId: string;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;

    auditService = { record: vi.fn().mockResolvedValue(undefined) } as any;
    cloudinaryService = {
      isConfigured: vi.fn().mockReturnValue(false),
      uploadStream: vi.fn(),
    } as any;

    uploadService = new AssignmentUploadService(cloudinaryService);
    discussionsService = new DiscussionsService(db, auditService);
    assignmentsService = new AssignmentsService(db, auditService, uploadService);

    instructorId = crypto.randomUUID();
    otherInstructorId = crypto.randomUUID();
    studentAId = crypto.randomUUID();
    studentBId = crypto.randomUUID();
    nonEnrolledStudentId = crypto.randomUUID();
    adminId = crypto.randomUUID();
    categoryId = crypto.randomUUID();
    courseId = crypto.randomUUID();
    moduleId = crypto.randomUUID();
    lessonId = crypto.randomUUID();

    // 1. Fetch role IDs
    const allRoles = await db.select().from(roles);
    const roleMap = new Map(allRoles.map((r: any) => [r.name, r.id]));

    const runSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    // 2. Seed Users
    await db.insert(users).values([
      {
        id: instructorId,
        name: 'Lead Instructor',
        username: `instructor_p74_${runSuffix}_1`,
        email: `instructor_p74_${runSuffix}_1@techsprout.edu`,
        passwordHash: 'hash',
        isVerified: true,
      },
      {
        id: otherInstructorId,
        name: 'Other Instructor',
        username: `instructor_p74_${runSuffix}_2`,
        email: `instructor_p74_${runSuffix}_2@techsprout.edu`,
        passwordHash: 'hash',
        isVerified: true,
      },
      {
        id: studentAId,
        name: 'Student Alice',
        username: `student_a_p74_${runSuffix}`,
        email: `alice_p74_${runSuffix}@techsprout.edu`,
        passwordHash: 'hash',
        isVerified: true,
      },
      {
        id: studentBId,
        name: 'Student Bob',
        username: `student_b_p74_${runSuffix}`,
        email: `bob_p74_${runSuffix}@techsprout.edu`,
        passwordHash: 'hash',
        isVerified: true,
      },
      {
        id: nonEnrolledStudentId,
        name: 'Unenrolled Charlie',
        username: `student_c_p74_${runSuffix}`,
        email: `charlie_p74_${runSuffix}@techsprout.edu`,
        passwordHash: 'hash',
        isVerified: true,
      },
      {
        id: adminId,
        name: 'Site Administrator',
        username: `admin_p74_${runSuffix}`,
        email: `admin_p74_${runSuffix}@techsprout.edu`,
        passwordHash: 'hash',
        isVerified: true,
      },
    ]);

    // 3. Assign Roles
    await db.insert(userRoles).values([
      { userId: instructorId, roleId: roleMap.get('instructor') },
      { userId: otherInstructorId, roleId: roleMap.get('instructor') },
      { userId: studentAId, roleId: roleMap.get('student') },
      { userId: studentBId, roleId: roleMap.get('student') },
      { userId: nonEnrolledStudentId, roleId: roleMap.get('student') },
      { userId: adminId, roleId: roleMap.get('admin') },
    ]);

    // 4. Seed Category
    await db.insert(categories).values({
      id: categoryId,
      name: 'Computer Science',
      slug: `cs-${runSuffix}`,
    });

    // 5. Seed Course
    await db.insert(courses).values({
      id: courseId,
      instructorId,
      categoryId,
      title: 'Full-Stack Distributed Systems',
      slug: `full-stack-dist-${runSuffix}`,
      status: 'PUBLISHED',
      price: '5000',
    });

    // 6. Seed Module and Lesson
    await db.insert(modules).values({
      id: moduleId,
      courseId,
      title: 'Module 1: Architecture',
      position: 1,
    });

    await db.insert(lessons).values({
      id: lessonId,
      moduleId,
      title: 'Lesson 1.1: Event Sourcing & CQRS',
      position: 1,
      lessonType: 'VIDEO',
      durationSeconds: 900,
    });

    // 7. Seed Enrollments for Student A and Student B (Active)
    await db.insert(enrollments).values([
      {
        studentId: studentAId,
        courseId,
        status: 'ACTIVE',
      },
      {
        studentId: studentBId,
        courseId,
        status: 'ACTIVE',
      },
    ]);
  });

  // ==========================================
  // SECTION 1: THREADED COURSE DISCUSSIONS
  // ==========================================
  describe('1. Threaded Course Discussions', () => {
    it('1.1 should allow an enrolled student to create a discussion thread on a lesson', async () => {
      const disc = await discussionsService.createDiscussion(courseId, lessonId, studentAId, {
        title: 'How does event projection handle idempotency?',
        content: 'When projecting events into the read store, what happens if duplicate events arrive?',
      });

      expect(disc.id).toBeDefined();
      expect(disc.title).toBe('How does event projection handle idempotency?');
      expect(disc.status).toBe('ACTIVE');
      expect(disc.isCourseInstructor).toBe(false);
      expect(disc.replyCount).toBe(0);
      expect(disc.upvoteCount).toBe(0);
    });

    it('1.2 should reject discussion creation from a non-enrolled student', async () => {
      await expect(
        discussionsService.createDiscussion(courseId, lessonId, nonEnrolledStudentId, {
          title: 'Unenrolled query',
          content: 'I want to ask without paying',
        })
      ).rejects.toThrow('ENROLLMENT_REQUIRED');
    });

    it('1.3 should create threaded replies and maintain parent-child relationship', async () => {
      const parentDisc = await discussionsService.createDiscussion(courseId, lessonId, studentAId, {
        title: 'Distributed Transaction Query',
        content: 'Is Saga pattern better than Two-Phase Commit?',
      });

      // Instructor answers
      const topReply = await discussionsService.createReply(courseId, lessonId, parentDisc.id, instructorId, {
        content: 'Yes, Sagas avoid locking resources across distributed microservices.',
      });

      expect(topReply.id).toBeDefined();
      expect(topReply.isCourseInstructor).toBe(true); // Instructor badge verified
      expect(topReply.parentReplyId).toBeNull();

      // Student B replies to instructor
      const childReply = await discussionsService.createReply(courseId, lessonId, parentDisc.id, studentBId, {
        content: 'What about compensating transactions if step 3 fails?',
        parentReplyId: topReply.id,
      });

      expect(childReply.parentReplyId).toBe(topReply.id);

      // Verify hierarchical retrieval
      const thread = await discussionsService.getDiscussion(courseId, lessonId, parentDisc.id, studentAId);
      expect(thread.replyCount).toBe(2);
      expect(thread.replies).toHaveLength(1);
      expect(thread.replies[0].id).toBe(topReply.id);
      expect(thread.replies[0].replies).toHaveLength(1);
      expect(thread.replies[0].replies![0].id).toBe(childReply.id);
    });

    it('1.4 should reject reply when parentReplyId does not belong to the discussion', async () => {
      const disc1 = await discussionsService.createDiscussion(courseId, lessonId, studentAId, {
        title: 'Thread 1',
        content: 'Content 1',
      });
      const disc2 = await discussionsService.createDiscussion(courseId, lessonId, studentBId, {
        title: 'Thread 2',
        content: 'Content 2',
      });

      const replyOnDisc2 = await discussionsService.createReply(courseId, lessonId, disc2.id, studentBId, {
        content: 'Reply on thread 2',
      });

      // Try replying on disc1 referencing reply from disc2
      await expect(
        discussionsService.createReply(courseId, lessonId, disc1.id, studentAId, {
          content: 'Sneaky reply',
          parentReplyId: replyOnDisc2.id,
        })
      ).rejects.toThrow('INVALID_PARENT_REPLY');
    });

    it('1.5 should verify trusted server-side instructor and admin badges', async () => {
      // 1. Instructor post
      const instructorDisc = await discussionsService.createDiscussion(courseId, lessonId, instructorId, {
        title: 'Instructor Announcement',
        content: 'Please review chapter 4 before office hours.',
      });
      expect(instructorDisc.isCourseInstructor).toBe(true);
      expect(instructorDisc.isAdmin).toBe(false);

      // 2. Admin post
      const adminDisc = await discussionsService.createDiscussion(courseId, lessonId, adminId, {
        title: 'Platform Maintenance Notice',
        content: 'Maintenance scheduled for Sunday.',
      });
      expect(adminDisc.isAdmin).toBe(true);

      // 3. Other instructor (not owner of this course, enrolled as learner)
      await db.insert(enrollments).values({
        studentId: otherInstructorId,
        courseId,
        status: 'ACTIVE',
      });

      const otherDisc = await discussionsService.createDiscussion(courseId, lessonId, otherInstructorId, {
        title: 'Guest question',
        content: 'Greetings from guest instructor',
      });
      expect(otherDisc.isCourseInstructor).toBe(false); // Only actual course owner gets instructor badge
    });

    it('1.6 should toggle upvote cleanly (1 vote per user)', async () => {
      const disc = await discussionsService.createDiscussion(courseId, lessonId, studentAId, {
        title: 'Great Explanation',
        content: 'This lesson was super clear.',
      });

      // Student B votes
      const vote1 = await discussionsService.toggleDiscussionVote(courseId, lessonId, disc.id, studentBId);
      expect(vote1.upvoted).toBe(true);
      expect(vote1.upvoteCount).toBe(1);

      // Student B votes again -> toggles off
      const vote2 = await discussionsService.toggleDiscussionVote(courseId, lessonId, disc.id, studentBId);
      expect(vote2.upvoted).toBe(false);
      expect(vote2.upvoteCount).toBe(0);
    });

    it('1.7 should handle instructor moderation (pinning and resolving)', async () => {
      const disc = await discussionsService.createDiscussion(courseId, lessonId, studentAId, {
        title: 'Common Mistake in Dockerfile',
        content: 'Make sure not to run as root.',
      });

      // Instructor pins the thread
      const pinned = await discussionsService.updateDiscussion(courseId, lessonId, disc.id, instructorId, {
        isPinned: true,
        status: 'RESOLVED',
      });

      expect(pinned.isPinned).toBe(true);
      expect(pinned.status).toBe('RESOLVED');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DISCUSSION_PINNED' })
      );

      // Regular student cannot pin or change status to HIDDEN
      await expect(
        discussionsService.updateDiscussion(courseId, lessonId, disc.id, studentBId, {
          isPinned: false,
        })
      ).rejects.toThrow('Only course instructors or admins can pin discussions');
    });

    it('1.8 should allow author to edit and soft-delete their own discussion', async () => {
      const disc = await discussionsService.createDiscussion(courseId, lessonId, studentAId, {
        title: 'Original Title',
        content: 'Original Content',
      });

      const updated = await discussionsService.updateDiscussion(courseId, lessonId, disc.id, studentAId, {
        title: 'Updated Title',
        content: 'Updated Content with more details.',
      });

      expect(updated.title).toBe('Updated Title');

      const del = await discussionsService.deleteDiscussion(courseId, lessonId, disc.id, studentAId);
      expect(del.success).toBe(true);

      // Verify soft deleted status in DB
      const [inDb] = await db.select().from(discussions).where(eq(discussions.id, disc.id));
      expect(inDb.status).toBe('DELETED');
    });
  });

  // ==========================================
  // SECTION 2: MARKDOWN & UPLOAD SECURITY
  // ==========================================
  describe('2. Markdown & Upload Security Safeguards', () => {
    it('2.1 should strictly reject script tags and unsafe schemes in discussion content', async () => {
      await expect(
        discussionsService.createDiscussion(courseId, lessonId, studentAId, {
          title: 'Harmless Title',
          content: 'Hello <script>alert("XSS")</script> World',
        })
      ).rejects.toThrow('MALICIOUS_CONTENT_REJECTED');

      await expect(
        discussionsService.createDiscussion(courseId, lessonId, studentAId, {
          title: 'Check this link',
          content: 'Click here: [Pwned](javascript:stealCookies())',
        })
      ).rejects.toThrow('MALICIOUS_CONTENT_REJECTED');
    });

    it('2.2 should reject inline DOM event handlers (onerror, onload)', async () => {
      await expect(
        discussionsService.createDiscussion(courseId, lessonId, studentAId, {
          title: 'Image Test',
          content: '<img src="invalid.jpg" onerror="alert(document.cookie)" />',
        })
      ).rejects.toThrow('MALICIOUS_CONTENT_REJECTED');
    });

    it('2.3 should accept valid PDF file with %PDF- magic bytes', () => {
      const pdfHeader = Buffer.from('%PDF-1.7\n%some content');
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'assignment_solution.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: pdfHeader,
        size: pdfHeader.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      const result = uploadService.validateFile(mockFile);
      expect(result.detectedType).toBe('PDF');
      expect(result.safeFilename).toBe('assignment_solution.pdf');
    });

    it('2.4 should accept valid ZIP archive with PK header magic bytes', () => {
      const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'project_repo.zip',
        encoding: '7bit',
        mimetype: 'application/zip',
        buffer: zipHeader,
        size: zipHeader.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      const result = uploadService.validateFile(mockFile);
      expect(result.detectedType).toBe('ZIP');
      expect(result.safeFilename).toBe('project_repo.zip');
    });

    it('2.5 should reject spoofed file with .pdf extension but invalid magic bytes', () => {
      const fakePdf = Buffer.from('NOT A REAL PDF FILE HEADER');
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'malicious.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: fakePdf,
        size: fakePdf.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      expect(() => uploadService.validateFile(mockFile)).toThrow('INVALID_FILE_SIGNATURE');
    });

    it('2.6 should reject unsupported executable file extensions (.exe, .sh, .py)', () => {
      const exeBuffer = Buffer.from('MZ\x90\x00');
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'exploit.exe',
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        buffer: exeBuffer,
        size: exeBuffer.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      expect(() => uploadService.validateFile(mockFile)).toThrow('INVALID_FILE_EXTENSION');
    });

    it('2.7 should reject files exceeding the 25 MB limit', () => {
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024); // 26 MB
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'huge_archive.zip',
        encoding: '7bit',
        mimetype: 'application/zip',
        buffer: largeBuffer,
        size: largeBuffer.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      expect(() => uploadService.validateFile(mockFile)).toThrow('FILE_TOO_LARGE');
    });

    it('2.8 should reject directory traversal sequences in original filenames', () => {
      const validPdf = Buffer.from('%PDF-1.4\nvalid content');
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: '../../etc/passwd.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: validPdf,
        size: validPdf.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      expect(() => uploadService.validateFile(mockFile)).toThrow('PATH_TRAVERSAL_REJECTED');
    });
  });

  // ==========================================
  // SECTION 3: PROJECT ASSIGNMENTS & GRADING
  // ==========================================
  describe('3. Project Assignments & Rubric Grading', () => {
    let assignmentId: string;

    it('3.1 should allow course instructor to author an assignment with rubrics and maxScore', async () => {
      const created = await assignmentsService.createAssignment(courseId, instructorId, {
        lessonId,
        title: 'Project 1: Build a Reliable Message Broker',
        description: 'Design and implement an in-memory transactional message broker.',
        instructions: 'Include test coverage with at least 5 concurrency test cases.',
        maxScore: 100,
        status: 'PUBLISHED',
        allowResubmission: true,
        rubric: [
          { id: 'crit-1', title: 'Data Durability', maxScore: 40, description: 'WAL logging implementation' },
          { id: 'crit-2', title: 'Concurrency Safety', maxScore: 40, description: 'Mutex locks or atomic CAS' },
          { id: 'crit-3', title: 'Code Cleanliness', maxScore: 20, description: 'Idiomatic TypeScript' },
        ],
      });

      expect(created.id).toBeDefined();
      expect(created.title).toBe('Project 1: Build a Reliable Message Broker');
      expect(created.maxScore).toBe(100);
      expect(created.status).toBe('PUBLISHED');
      expect(created.rubric).toHaveLength(3);

      assignmentId = created.id;
    });

    it('3.2 should prevent students or unauthorized instructors from creating assignments', async () => {
      await expect(
        assignmentsService.createAssignment(courseId, studentAId, {
          title: 'Student Attempted Assignment',
          description: 'Students should not create assignments',
        })
      ).rejects.toThrow('Only course instructor or administrator can perform this operation');

      await expect(
        assignmentsService.createAssignment(courseId, otherInstructorId, {
          title: 'Rogue Instructor Assignment',
          description: 'Cannot edit other instructors courses',
        })
      ).rejects.toThrow('Only course instructor or administrator can perform this operation');
    });

    it('3.3 should allow enrolled student to submit assignment archive and create version 1', async () => {
      // First ensure assignment exists
      const created = await assignmentsService.createAssignment(courseId, instructorId, {
        title: 'Hands-on Project',
        description: 'Assignment description',
        status: 'PUBLISHED',
        maxScore: 100,
      });

      const validZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'alice_solution.zip',
        encoding: '7bit',
        mimetype: 'application/zip',
        buffer: validZip,
        size: validZip.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      const submission = await assignmentsService.submitAssignment(
        courseId,
        created.id,
        studentAId,
        mockFile,
        'First complete draft submitted.'
      );

      expect(submission.id).toBeDefined();
      expect(submission.studentId).toBe(studentAId);
      expect(submission.version).toBe(1);
      expect(submission.status).toBe('SUBMITTED');
      expect(submission.studentNotes).toBe('First complete draft submitted.');
      expect(submission.fileUrl).toContain('alice_solution.zip');
    });

    it('3.4 should support student resubmission and increment version to 2', async () => {
      const created = await assignmentsService.createAssignment(courseId, instructorId, {
        title: 'Resubmission Allowed Project',
        description: 'Description',
        status: 'PUBLISHED',
        allowResubmission: true,
      });

      const validPdf = Buffer.from('%PDF-1.7\nsolution v1');
      const mockFile1: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'v1.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: validPdf,
        size: validPdf.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      await assignmentsService.submitAssignment(courseId, created.id, studentAId, mockFile1);

      // Resubmit v2
      const validPdfV2 = Buffer.from('%PDF-1.7\nsolution v2 updated');
      const mockFile2: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'v2_fixed.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: validPdfV2,
        size: validPdfV2.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      const sub2 = await assignmentsService.submitAssignment(
        courseId,
        created.id,
        studentAId,
        mockFile2,
        'Fixed memory leak discovered in v1.'
      );

      expect(sub2.version).toBe(2);
      expect(sub2.status).toBe('RESUBMITTED');

      // Check student submissions history
      const history = await assignmentsService.getMySubmissions(courseId, created.id, studentAId);
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(2);
      expect(history[1].version).toBe(1);
    });

    it('3.5 should reject submissions when assignment status is DRAFT or CLOSED', async () => {
      const draftAssignment = await assignmentsService.createAssignment(courseId, instructorId, {
        title: 'Draft Project',
        description: 'Not published yet',
        status: 'DRAFT',
      });

      const validPdf = Buffer.from('%PDF-1.7\ncontent');
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'early.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: validPdf,
        size: validPdf.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      await expect(
        assignmentsService.submitAssignment(courseId, draftAssignment.id, studentAId, mockFile)
      ).rejects.toThrow('ASSIGNMENT_NOT_OPEN');
    });

    it('3.6 should enforce student privacy (Student B cannot access Student A submission)', async () => {
      const created = await assignmentsService.createAssignment(courseId, instructorId, {
        title: 'Private Project',
        description: 'Exam assignment',
        status: 'PUBLISHED',
      });

      const validPdf = Buffer.from('%PDF-1.7\nAlice private submission');
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'alice_exam.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: validPdf,
        size: validPdf.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      const aliceSub = await assignmentsService.submitAssignment(
        courseId,
        created.id,
        studentAId,
        mockFile
      );

      // Student B attempts to read Alice's submission
      await expect(
        assignmentsService.getSubmission(courseId, created.id, aliceSub.id, studentBId)
      ).rejects.toThrow('You cannot view another student submission');

      // Instructor CAN access Alice's submission
      const instructorView = await assignmentsService.getSubmission(
        courseId,
        created.id,
        aliceSub.id,
        instructorId
      );
      expect(instructorView.id).toBe(aliceSub.id);
    });

    it('3.7 should allow course instructor to grade student submission with rubric evaluation and feedback', async () => {
      const created = await assignmentsService.createAssignment(courseId, instructorId, {
        title: 'Gradable Project',
        description: 'Rubric grading test',
        status: 'PUBLISHED',
        maxScore: 100,
        rubric: [
          { id: 'crit-a', title: 'Correctness', maxScore: 60 },
          { id: 'crit-b', title: 'Performance', maxScore: 40 },
        ],
      });

      const validZip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'student_work.zip',
        encoding: '7bit',
        mimetype: 'application/zip',
        buffer: validZip,
        size: validZip.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      const sub = await assignmentsService.submitAssignment(courseId, created.id, studentAId, mockFile);

      // Instructor grades
      const grade = await assignmentsService.gradeSubmission(courseId, created.id, sub.id, instructorId, {
        score: 95,
        feedback: 'Outstanding architecture and high performance throughput.',
        rubricEvaluation: [
          { criterionId: 'crit-a', score: 60, feedback: 'All unit and integration tests passed' },
          { criterionId: 'crit-b', score: 35, feedback: 'Minor cache thrashing under 10k RPS' },
        ],
      });

      expect(grade.score).toBe(95);
      expect(grade.maxScore).toBe(100);
      expect(grade.percentage).toBe(95);
      expect(grade.feedback).toContain('Outstanding architecture');

      // Verify submission status updated to GRADED
      const updatedSub = await assignmentsService.getSubmission(courseId, created.id, sub.id, studentAId);
      expect(updatedSub.status).toBe('GRADED');
      expect(updatedSub.grade).not.toBeNull();
      expect(updatedSub.grade?.score).toBe(95);
    });

    it('3.8 should reject grades exceeding maximum allowed points for the assignment', async () => {
      const created = await assignmentsService.createAssignment(courseId, instructorId, {
        title: 'Max Score Test',
        description: 'Max score 50 points',
        status: 'PUBLISHED',
        maxScore: 50,
      });

      const validPdf = Buffer.from('%PDF-1.7\ncontent');
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'work.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: validPdf,
        size: validPdf.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      const sub = await assignmentsService.submitAssignment(courseId, created.id, studentAId, mockFile);

      // Try assigning 75 points when max is 50
      await expect(
        assignmentsService.gradeSubmission(courseId, created.id, sub.id, instructorId, {
          score: 75,
          feedback: 'Too generous',
        })
      ).rejects.toThrow('SCORE_EXCEEDS_MAX');
    });
  });
});
