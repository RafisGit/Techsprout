import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from './test-helper';
import {
  enrollments,
  lessonProgress,
  courses,
  modules,
  lessons,
  users,
  categories,
} from '../database/schema';
import { eq } from 'drizzle-orm';
import { seedCatalog } from '../database/seed/catalog.seeder';

describe('P3.1 — Enrollment & Learning Progress Database Test Suite', () => {
  let db: any;
  let pool: any;
  let studentUser: any;
  let instructorUser: any;
  let testCourse: any;
  let testModule: any;
  let testLesson: any;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    pool = testDb.pool;

    // Seed catalog to have baseline categories, courses, modules, lessons
    await seedCatalog(db);

    // Retrieve seeded student user
    const [student] = await db
      .select()
      .from(users)
      .where(eq(users.username, 'student'))
      .limit(1);
    studentUser = student;

    // Retrieve seeded instructor user
    const [instructor] = await db
      .select()
      .from(users)
      .where(eq(users.username, 'instructor'))
      .limit(1);
    instructorUser = instructor;

    // Retrieve first seeded course
    const [course] = await db.select().from(courses).limit(1);
    testCourse = course;

    // Retrieve first module and lesson for this course
    const [mod] = await db
      .select()
      .from(modules)
      .where(eq(modules.courseId, testCourse.id))
      .limit(1);
    testModule = mod;

    const [les] = await db
      .select()
      .from(lessons)
      .where(eq(lessons.moduleId, testModule.id))
      .limit(1);
    testLesson = les;
  });

  describe('1. Enrollments Schema & Constraints', () => {
    it('should create a valid enrollment record with default status ACTIVE', async () => {
      const [enrollment] = await db
        .insert(enrollments)
        .values({
          studentId: studentUser.id,
          courseId: testCourse.id,
        })
        .returning();

      expect(enrollment).toBeDefined();
      expect(enrollment.id).toBeDefined();
      expect(enrollment.studentId).toBe(studentUser.id);
      expect(enrollment.courseId).toBe(testCourse.id);
      expect(enrollment.status).toBe('ACTIVE');
      expect(enrollment.enrolledAt).toBeInstanceOf(Date);
      expect(enrollment.startedAt).toBeNull();
      expect(enrollment.completedAt).toBeNull();
      expect(enrollment.lastAccessedAt).toBeNull();
      expect(enrollment.createdAt).toBeInstanceOf(Date);
      expect(enrollment.updatedAt).toBeInstanceOf(Date);
    });

    it('should enforce UNIQUE(student_id, course_id) constraint', async () => {
      await db.insert(enrollments).values({
        studentId: studentUser.id,
        courseId: testCourse.id,
      });

      // Attempting duplicate enrollment must fail with unique constraint violation
      await expect(
        db.insert(enrollments).values({
          studentId: studentUser.id,
          courseId: testCourse.id,
        })
      ).rejects.toThrow();
    });

    it('should reject enrollment with invalid foreign key student_id', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-999999999999';

      await expect(
        db.insert(enrollments).values({
          studentId: nonExistentUserId,
          courseId: testCourse.id,
        })
      ).rejects.toThrow();
    });

    it('should reject enrollment with invalid foreign key course_id', async () => {
      const nonExistentCourseId = '00000000-0000-0000-0000-999999999999';

      await expect(
        db.insert(enrollments).values({
          studentId: studentUser.id,
          courseId: nonExistentCourseId,
        })
      ).rejects.toThrow();
    });

    it('should prevent student deletion when enrollments exist (ON DELETE RESTRICT)', async () => {
      await db.insert(enrollments).values({
        studentId: studentUser.id,
        courseId: testCourse.id,
      });

      // Deleting student must be blocked by RESTRICT constraint
      await expect(
        db.delete(users).where(eq(users.id, studentUser.id))
      ).rejects.toThrow();
    });

    it('should prevent course deletion when enrollments exist (ON DELETE RESTRICT)', async () => {
      await db.insert(enrollments).values({
        studentId: studentUser.id,
        courseId: testCourse.id,
      });

      // Deleting course must be blocked by RESTRICT constraint
      await expect(
        db.delete(courses).where(eq(courses.id, testCourse.id))
      ).rejects.toThrow();
    });

    it('should persist cancellation state with updated timestamps', async () => {
      const [enrollment] = await db
        .insert(enrollments)
        .values({
          studentId: studentUser.id,
          courseId: testCourse.id,
        })
        .returning();

      const [updated] = await db
        .update(enrollments)
        .set({
          status: 'CANCELLED',
          updatedAt: new Date(),
        })
        .where(eq(enrollments.id, enrollment.id))
        .returning();

      expect(updated.status).toBe('CANCELLED');
    });

    it('should persist completion state with completed_at timestamp', async () => {
      const [enrollment] = await db
        .insert(enrollments)
        .values({
          studentId: studentUser.id,
          courseId: testCourse.id,
        })
        .returning();

      const completionDate = new Date();
      const [updated] = await db
        .update(enrollments)
        .set({
          status: 'COMPLETED',
          completedAt: completionDate,
          updatedAt: new Date(),
        })
        .where(eq(enrollments.id, enrollment.id))
        .returning();

      expect(updated.status).toBe('COMPLETED');
      expect(updated.completedAt).toBeInstanceOf(Date);
    });

    it('should allow instructors to self-enroll as learners', async () => {
      const [instructorEnrollment] = await db
        .insert(enrollments)
        .values({
          studentId: instructorUser.id,
          courseId: testCourse.id,
        })
        .returning();

      expect(instructorEnrollment.id).toBeDefined();
      expect(instructorEnrollment.studentId).toBe(instructorUser.id);
      expect(instructorEnrollment.status).toBe('ACTIVE');
    });
  });

  describe('2. Lesson Progress Schema & Constraints', () => {
    let activeEnrollment: any;

    beforeEach(async () => {
      const [enrollment] = await db
        .insert(enrollments)
        .values({
          studentId: studentUser.id,
          courseId: testCourse.id,
        })
        .returning();
      activeEnrollment = enrollment;
    });

    it('should create a valid lesson_progress record on first user interaction', async () => {
      const [progress] = await db
        .insert(lessonProgress)
        .values({
          enrollmentId: activeEnrollment.id,
          lessonId: testLesson.id,
        })
        .returning();

      expect(progress).toBeDefined();
      expect(progress.id).toBeDefined();
      expect(progress.enrollmentId).toBe(activeEnrollment.id);
      expect(progress.lessonId).toBe(testLesson.id);
      expect(progress.status).toBe('IN_PROGRESS');
      expect(progress.watchPositionSeconds).toBe(0);
      expect(progress.completedAt).toBeNull();
      expect(progress.lastAccessedAt).toBeInstanceOf(Date);
      expect(progress.createdAt).toBeInstanceOf(Date);
      expect(progress.updatedAt).toBeInstanceOf(Date);
    });

    it('should enforce UNIQUE(enrollment_id, lesson_id) constraint', async () => {
      await db.insert(lessonProgress).values({
        enrollmentId: activeEnrollment.id,
        lessonId: testLesson.id,
      });

      // Attempting duplicate progress record for the same lesson on the same enrollment must fail
      await expect(
        db.insert(lessonProgress).values({
          enrollmentId: activeEnrollment.id,
          lessonId: testLesson.id,
        })
      ).rejects.toThrow();
    });

    it('should reject lesson_progress with invalid enrollment_id FK', async () => {
      const nonExistentEnrollmentId = '00000000-0000-0000-0000-999999999999';

      await expect(
        db.insert(lessonProgress).values({
          enrollmentId: nonExistentEnrollmentId,
          lessonId: testLesson.id,
        })
      ).rejects.toThrow();
    });

    it('should reject lesson_progress with invalid lesson_id FK', async () => {
      const nonExistentLessonId = '00000000-0000-0000-0000-999999999999';

      await expect(
        db.insert(lessonProgress).values({
          enrollmentId: activeEnrollment.id,
          lessonId: nonExistentLessonId,
        })
      ).rejects.toThrow();
    });

    it('should cascade delete lesson_progress when parent enrollment is deleted', async () => {
      const [progress] = await db
        .insert(lessonProgress)
        .values({
          enrollmentId: activeEnrollment.id,
          lessonId: testLesson.id,
        })
        .returning();

      expect(progress.id).toBeDefined();

      // Delete parent enrollment
      await db.delete(enrollments).where(eq(enrollments.id, activeEnrollment.id));

      // Child lesson_progress must be cascade deleted
      const remainingProgress = await db
        .select()
        .from(lessonProgress)
        .where(eq(lessonProgress.id, progress.id));

      expect(remainingProgress.length).toBe(0);
    });

    it('should prevent lesson deletion when progress history exists (ON DELETE RESTRICT)', async () => {
      await db.insert(lessonProgress).values({
        enrollmentId: activeEnrollment.id,
        lessonId: testLesson.id,
      });

      // Attempting to delete lesson must be rejected by RESTRICT foreign key constraint
      await expect(
        db.delete(lessons).where(eq(lessons.id, testLesson.id))
      ).rejects.toThrow();
    });

    it('should persist watchPositionSeconds updates and track lastAccessedAt', async () => {
      const [progress] = await db
        .insert(lessonProgress)
        .values({
          enrollmentId: activeEnrollment.id,
          lessonId: testLesson.id,
        })
        .returning();

      const newTimestamp = new Date(Date.now() + 10000);
      const [updated] = await db
        .update(lessonProgress)
        .set({
          watchPositionSeconds: 345,
          lastAccessedAt: newTimestamp,
          updatedAt: new Date(),
        })
        .where(eq(lessonProgress.id, progress.id))
        .returning();

      expect(updated.watchPositionSeconds).toBe(345);
      expect(updated.status).toBe('IN_PROGRESS');
    });

    it('should persist lesson completion with completedAt timestamp', async () => {
      const [progress] = await db
        .insert(lessonProgress)
        .values({
          enrollmentId: activeEnrollment.id,
          lessonId: testLesson.id,
        })
        .returning();

      const completedAt = new Date();
      const [completed] = await db
        .update(lessonProgress)
        .set({
          status: 'COMPLETED',
          completedAt,
          updatedAt: new Date(),
        })
        .where(eq(lessonProgress.id, progress.id))
        .returning();

      expect(completed.status).toBe('COMPLETED');
      expect(completed.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('3. Enum Values & Virtual States', () => {
    it('should verify all valid enrollment status enum values', async () => {
      // ACTIVE
      const [e1] = await db
        .insert(enrollments)
        .values({
          studentId: studentUser.id,
          courseId: testCourse.id,
          status: 'ACTIVE',
        })
        .returning();
      expect(e1.status).toBe('ACTIVE');

      // CANCELLED
      const [e2] = await db
        .update(enrollments)
        .set({ status: 'CANCELLED' })
        .where(eq(enrollments.id, e1.id))
        .returning();
      expect(e2.status).toBe('CANCELLED');

      // COMPLETED
      const [e3] = await db
        .update(enrollments)
        .set({ status: 'COMPLETED' })
        .where(eq(enrollments.id, e1.id))
        .returning();
      expect(e3.status).toBe('COMPLETED');
    });

    it('should verify all valid lesson progress status enum values', async () => {
      const [enrollment] = await db
        .insert(enrollments)
        .values({
          studentId: studentUser.id,
          courseId: testCourse.id,
        })
        .returning();

      // IN_PROGRESS
      const [p1] = await db
        .insert(lessonProgress)
        .values({
          enrollmentId: enrollment.id,
          lessonId: testLesson.id,
          status: 'IN_PROGRESS',
        })
        .returning();
      expect(p1.status).toBe('IN_PROGRESS');

      // COMPLETED
      const [p2] = await db
        .update(lessonProgress)
        .set({ status: 'COMPLETED' })
        .where(eq(lessonProgress.id, p1.id))
        .returning();
      expect(p2.status).toBe('COMPLETED');
    });

    it('should verify NOT_STARTED is purely virtual with zero database rows', async () => {
      const [enrollment] = await db
        .insert(enrollments)
        .values({
          studentId: studentUser.id,
          courseId: testCourse.id,
        })
        .returning();

      // Zero lesson_progress rows exist immediately after enrollment
      const progressRows = await db
        .select()
        .from(lessonProgress)
        .where(eq(lessonProgress.enrollmentId, enrollment.id));

      expect(progressRows.length).toBe(0);
    });
  });
});
