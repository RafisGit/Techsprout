import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './test-helper';
import {
  courses,
  courseStatusEnum,
  courseReviewRequests,
  courseReviewStatusEnum,
  instructorProfiles,
  users,
  categories,
} from '../database/schema';
import { eq } from 'drizzle-orm';
import {
  courseStatusSchema,
  courseReviewStatusSchema,
  submitCourseReviewSchema,
  reviewDecisionSchema,
  updateInstructorProfileSchema,
} from '@techsprout/contracts';

describe('P6.2 — WP-01: Database Schema & Contracts Foundation Test Suite', () => {
  let db: any;
  let testUserId: string;
  let testCategoryId: string;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;

    // Create a verified instructor user
    const [user] = await db
      .insert(users)
      .values({
        name: 'Dr. Sarah Mitchell',
        username: 'sarah.mitchell',
        email: 'sarah.mitchell@techsprout.edu',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
        isActive: true,
        isVerified: true,
      })
      .returning();
    testUserId = user.id;

    // Create a category
    const [cat] = await db
      .insert(categories)
      .values({
        name: 'Computer Science',
        slug: 'computer-science',
        description: 'Computer Science and Software Engineering courses',
      })
      .returning();
    testCategoryId = cat.id;
  });

  describe('1. Course Status Enum & In-Review Support', () => {
    it('1.1 should define courseStatusEnum with all required lifecycle values', () => {
      expect(courseStatusEnum.enumValues).toContain('DRAFT');
      expect(courseStatusEnum.enumValues).toContain('IN_REVIEW');
      expect(courseStatusEnum.enumValues).toContain('PUBLISHED');
      expect(courseStatusEnum.enumValues).toContain('ARCHIVED');
      expect(courseStatusEnum.enumValues.length).toBe(4);
    });

    it('1.2 should persist and query a course with status IN_REVIEW', async () => {
      const [course] = await db
        .insert(courses)
        .values({
          title: 'Advanced Distributed Systems',
          slug: 'advanced-distributed-systems',
          categoryId: testCategoryId,
          instructorId: testUserId,
          status: 'IN_REVIEW',
          price: '4500.00',
          currency: 'BDT',
          level: 'ADVANCED',
          durationMinutes: 120,
        })
        .returning();

      expect(course).toBeDefined();
      expect(course.status).toBe('IN_REVIEW');

      const [queried] = await db.select().from(courses).where(eq(courses.id, course.id)).limit(1);

      expect(queried.status).toBe('IN_REVIEW');
      expect(queried.title).toBe('Advanced Distributed Systems');
    });
  });

  describe('2. Course Review Requests Entity & Lifecycle States', () => {
    it('2.1 should define courseReviewStatusEnum with PENDING, APPROVED, REJECTED, WITHDRAWN', () => {
      expect(courseReviewStatusEnum.enumValues).toContain('PENDING');
      expect(courseReviewStatusEnum.enumValues).toContain('APPROVED');
      expect(courseReviewStatusEnum.enumValues).toContain('REJECTED');
      expect(courseReviewStatusEnum.enumValues).toContain('WITHDRAWN');
      expect(courseReviewStatusEnum.enumValues.length).toBe(4);
    });

    it('2.2 should create a course review request in PENDING status with default values', async () => {
      const [course] = await db
        .insert(courses)
        .values({
          title: 'Intro to Algorithms',
          slug: 'intro-to-algorithms',
          categoryId: testCategoryId,
          instructorId: testUserId,
          status: 'DRAFT',
          price: '2500.00',
        })
        .returning();

      const [review] = await db
        .insert(courseReviewRequests)
        .values({
          courseId: course.id,
          instructorId: testUserId,
          submissionNotes: 'All modules and lessons have been finalized. Ready for review.',
        })
        .returning();

      expect(review.id).toBeDefined();
      expect(review.courseId).toBe(course.id);
      expect(review.instructorId).toBe(testUserId);
      expect(review.status).toBe('PENDING');
      expect(review.submissionNotes).toBe(
        'All modules and lessons have been finalized. Ready for review.'
      );
      expect(review.adminFeedback).toBeNull();
      expect(review.reviewedBy).toBeNull();
      expect(review.submittedAt).toBeDefined();
      expect(review.reviewedAt).toBeNull();
    });

    it('2.3 should update a course review request upon administrative decision', async () => {
      const [course] = await db
        .insert(courses)
        .values({
          title: 'Data Structures Masterclass',
          slug: 'data-structures-masterclass',
          categoryId: testCategoryId,
          instructorId: testUserId,
          status: 'IN_REVIEW',
        })
        .returning();

      const [review] = await db
        .insert(courseReviewRequests)
        .values({
          courseId: course.id,
          instructorId: testUserId,
          status: 'PENDING',
        })
        .returning();

      const now = new Date();
      const [updated] = await db
        .update(courseReviewRequests)
        .set({
          status: 'APPROVED',
          adminFeedback: 'Curriculum meets institutional standards. Approved for public catalog.',
          reviewedBy: testUserId,
          reviewedAt: now,
        })
        .where(eq(courseReviewRequests.id, review.id))
        .returning();

      expect(updated.status).toBe('APPROVED');
      expect(updated.adminFeedback).toContain('Approved for public catalog');
      expect(updated.reviewedBy).toBe(testUserId);
      expect(updated.reviewedAt).toBeDefined();
    });

    it('2.4 should cascade delete review requests when the parent course is deleted', async () => {
      const [course] = await db
        .insert(courses)
        .values({
          title: 'Temporary Scratch Course',
          slug: 'temp-scratch-course',
          categoryId: testCategoryId,
          instructorId: testUserId,
        })
        .returning();

      await db.insert(courseReviewRequests).values({
        courseId: course.id,
        instructorId: testUserId,
      });

      // Delete course
      await db.delete(courses).where(eq(courses.id, course.id));

      const reviews = await db
        .select()
        .from(courseReviewRequests)
        .where(eq(courseReviewRequests.courseId, course.id));

      expect(reviews.length).toBe(0);
    });
  });

  describe('3. Instructor Profiles Entity & Credential Persistence', () => {
    it('3.1 should create and query an instructor profile record', async () => {
      const [profile] = await db
        .insert(instructorProfiles)
        .values({
          userId: testUserId,
          headline: 'Senior Computer Science Lecturer & Systems Architect',
          bio: 'Passionate educator with 12 years of university and industry experience.',
          credentials: 'Ph.D. in Computer Science (MIT), B.Sc. CSE (BUET)',
          expertiseAreas: JSON.stringify(['Algorithms', 'Distributed Systems', 'Cloud Computing']),
          websiteUrl: 'https://sarahmitchell.dev',
          linkedinUrl: 'https://linkedin.com/in/sarahmitchell',
          githubUrl: 'https://github.com/sarahmitchell',
        })
        .returning();

      expect(profile.id).toBeDefined();
      expect(profile.userId).toBe(testUserId);
      expect(profile.headline).toBe('Senior Computer Science Lecturer & Systems Architect');
      expect(profile.websiteUrl).toBe('https://sarahmitchell.dev');
      expect(profile.avatarMediaId).toBeNull();
      expect(profile.createdAt).toBeDefined();
      expect(profile.updatedAt).toBeDefined();

      const [queried] = await db
        .select()
        .from(instructorProfiles)
        .where(eq(instructorProfiles.userId, testUserId))
        .limit(1);

      expect(queried.headline).toBe(profile.headline);
    });

    it('3.2 should enforce unique constraint on instructor_profiles.user_id', async () => {
      await db.insert(instructorProfiles).values({
        userId: testUserId,
        headline: 'First Profile Entry',
      });

      await expect(
        db.insert(instructorProfiles).values({
          userId: testUserId,
          headline: 'Duplicate Profile Entry Attempt',
        })
      ).rejects.toThrow();
    });

    it('3.3 should cascade delete instructor profile when the user is deleted', async () => {
      // Create a temporary user
      const [tempUser] = await db
        .insert(users)
        .values({
          name: 'Temp Educator',
          username: 'temp.educator',
          email: 'temp.educator@techsprout.edu',
        })
        .returning();

      await db.insert(instructorProfiles).values({
        userId: tempUser.id,
        headline: 'Temporary Profile',
      });

      // Delete user
      await db.delete(users).where(eq(users.id, tempUser.id));

      const profiles = await db
        .select()
        .from(instructorProfiles)
        .where(eq(instructorProfiles.userId, tempUser.id));

      expect(profiles.length).toBe(0);
    });
  });

  describe('4. Shared Contracts Validation Schemas (@techsprout/contracts)', () => {
    it('4.1 courseStatusSchema should accept valid statuses including IN_REVIEW and reject invalid ones', () => {
      expect(courseStatusSchema.parse('DRAFT')).toBe('DRAFT');
      expect(courseStatusSchema.parse('IN_REVIEW')).toBe('IN_REVIEW');
      expect(courseStatusSchema.parse('PUBLISHED')).toBe('PUBLISHED');
      expect(courseStatusSchema.parse('ARCHIVED')).toBe('ARCHIVED');
      expect(() => courseStatusSchema.parse('DELETED')).toThrow();
      expect(() => courseStatusSchema.parse('PENDING')).toThrow();
    });

    it('4.2 courseReviewStatusSchema should validate review statuses', () => {
      expect(courseReviewStatusSchema.parse('PENDING')).toBe('PENDING');
      expect(courseReviewStatusSchema.parse('APPROVED')).toBe('APPROVED');
      expect(courseReviewStatusSchema.parse('REJECTED')).toBe('REJECTED');
      expect(courseReviewStatusSchema.parse('WITHDRAWN')).toBe('WITHDRAWN');
      expect(() => courseReviewStatusSchema.parse('UNKNOWN')).toThrow();
    });

    it('4.3 submitCourseReviewSchema should parse optional submission notes', () => {
      const validEmpty = submitCourseReviewSchema.parse({});
      expect(validEmpty.submissionNotes).toBeUndefined();

      const validWithNotes = submitCourseReviewSchema.parse({
        submissionNotes: 'Ready for final accreditation check.',
      });
      expect(validWithNotes.submissionNotes).toBe('Ready for final accreditation check.');

      expect(() =>
        submitCourseReviewSchema.parse({
          submissionNotes: 'a'.repeat(2001),
        })
      ).toThrow();
    });

    it('4.4 reviewDecisionSchema should require feedback when status is REJECTED', () => {
      // Approval with or without feedback is valid
      const validApproval = reviewDecisionSchema.parse({
        status: 'APPROVED',
      });
      expect(validApproval.status).toBe('APPROVED');

      // Rejection with feedback is valid
      const validRejection = reviewDecisionSchema.parse({
        status: 'REJECTED',
        adminFeedback: 'Please add at least 3 quiz questions to Module 2 before publication.',
      });
      expect(validRejection.status).toBe('REJECTED');
      expect(validRejection.adminFeedback).toBeDefined();

      // Rejection without feedback must fail
      expect(() =>
        reviewDecisionSchema.parse({
          status: 'REJECTED',
        })
      ).toThrow(/Rejection feedback is required/);

      // Rejection with empty whitespace feedback must fail
      expect(() =>
        reviewDecisionSchema.parse({
          status: 'REJECTED',
          adminFeedback: '   ',
        })
      ).toThrow(/Rejection feedback is required/);
    });

    it('4.5 updateInstructorProfileSchema should validate URLs and string length bounds', () => {
      const validProfile = updateInstructorProfileSchema.parse({
        headline: 'Lead Instructor in Web Architecture',
        bio: 'Over a decade of hands-on software development experience.',
        credentials: 'M.Sc. Software Engineering',
        expertiseAreas: ['React', 'NestJS', 'PostgreSQL'],
        websiteUrl: 'https://techsprout.edu',
        linkedinUrl: 'https://linkedin.com/in/educator',
        githubUrl: 'https://github.com/educator',
        avatarMediaId: null,
      });

      expect(validProfile.headline).toBe('Lead Instructor in Web Architecture');
      expect(validProfile.websiteUrl).toBe('https://techsprout.edu');

      // Invalid URL format must fail
      expect(() =>
        updateInstructorProfileSchema.parse({
          websiteUrl: 'not-a-valid-url',
        })
      ).toThrow();

      // Headline exceeding 150 chars must fail
      expect(() =>
        updateInstructorProfileSchema.parse({
          headline: 'x'.repeat(151),
        })
      ).toThrow();
    });
  });
});
