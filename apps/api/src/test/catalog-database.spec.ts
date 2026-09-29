import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDatabase } from './test-helper';
import {
  categories,
  media,
  courses,
  modules,
  lessons,
  users,
  roles,
  userRoles,
} from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { seedCatalog } from '../database/seed/catalog.seeder';
import { SEED_CATEGORIES, SEED_COURSES } from '../database/seed/catalog-fixtures';
import { MediaService } from '../modules/media/media.service';
import { CloudinaryService } from '../modules/media/cloudinary/cloudinary.service';
import { UsersService } from '../modules/users/users.service';
import { AuditService } from '../modules/audit/audit.service';
import { ApiException } from '../common/errors/api-error';
import { HttpStatus } from '@nestjs/common';

describe('P2.1 — Catalog Database & Media Persistence Test Suite', () => {
  let db: any;
  let pool: any;
  let auditService: AuditService;
  let usersService: UsersService;
  let mediaService: MediaService;
  let cloudinaryService: CloudinaryService;
  let mockCloudinaryClient: any;
  let testInstructorId: string;
  let testCategoryId: string;

  beforeEach(async () => {
    const testDb = await createTestDatabase();
    db = testDb.db;
    pool = testDb.pool;

    auditService = new AuditService(db);
    usersService = new UsersService(db, auditService);

    // Mock Cloudinary Client
    mockCloudinaryClient = {
      uploader: {
        upload_stream: vi.fn((options, callback) => {
          const { Writable } = require('stream');
          const mockStream = new Writable({
            write(chunk: any, encoding: any, cb: any) {
              cb();
            },
          });
          mockStream.on('finish', () => {
            callback(null, {
              public_id: options.public_id || 'mock_public_id',
              secure_url: `https://res.cloudinary.com/test/${options.resource_type || 'image'}/upload/${options.public_id || 'mock_public_id'}.jpg`,
              resource_type: options.resource_type || 'image',
              format: 'jpg',
              bytes: 20480,
              width: 800,
              height: 600,
              duration: options.resource_type === 'video' ? 120 : undefined,
              created_at: '2026-09-30T00:00:00Z',
            });
          });
          return mockStream;
        }),
        destroy: vi.fn().mockResolvedValue({ result: 'ok' }),
      },
      utils: {
        api_sign_request: vi.fn().mockReturnValue('mock_sha_sig'),
      },
      url: vi.fn((publicId: string) => `https://res.cloudinary.com/test/${publicId}`),
      config: vi.fn(),
    };

    cloudinaryService = new CloudinaryService(mockCloudinaryClient);
    mediaService = new MediaService(cloudinaryService, db);

    // Retrieve seeded instructor
    const [instUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'instructor@techsprout.edu'))
      .limit(1);

    testInstructorId = instUser.id;

    // Create a base category for course tests
    const [cat] = await db
      .insert(categories)
      .values({
        name: 'Web Engineering',
        slug: 'web-engineering',
        description: 'Test category for web courses',
        isActive: true,
      })
      .returning();

    testCategoryId = cat.id;
  });

  afterEach(async () => {
    if (pool) {
      await pool.end();
    }
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. ROLE TESTS: INSTRUCTOR
  // ==========================================
  describe('1. INSTRUCTOR Role System Integration', () => {
    it('should have seeded the instructor role in the roles table', async () => {
      const [instructorRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, 'instructor'))
        .limit(1);

      expect(instructorRole).toBeDefined();
      expect(instructorRole.name).toBe('instructor');
    });

    it('should have seeded an instructor user with instructor role in userRoles', async () => {
      const [instUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, 'instructor@techsprout.edu'))
        .limit(1);

      expect(instUser).toBeDefined();
      expect(instUser.name).toBe('Dr. Sarah Mitchell');

      const userRoleRecords = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, instUser.id));

      expect(userRoleRecords.length).toBeGreaterThan(0);
      expect(userRoleRecords[0].roleName).toBe('instructor');
    });

    it('should allow admin to assign the instructor role to another user', async () => {
      const [studentUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, 'student@techsprout.edu'))
        .limit(1);

      const [adminUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, 'admin@techsprout.edu'))
        .limit(1);

      const res = await usersService.assignRole(
        studentUser.id,
        'instructor',
        adminUser.id,
        '127.0.0.1',
        'req-test-1'
      );

      expect(res.success).toBe(true);
      expect(res.message).toContain('instructor');

      const userRoleRecords = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, studentUser.id));

      expect(userRoleRecords[0].roleName).toBe('instructor');
    });
  });

  // ==========================================
  // 2. CATEGORY TESTS
  // ==========================================
  describe('2. Categories Schema & Constraints', () => {
    it('should successfully create a valid category with default isActive=true', async () => {
      const [created] = await db
        .insert(categories)
        .values({
          name: 'Mobile Engineering',
          slug: 'mobile-engineering',
          description: 'Mobile app development courses',
        })
        .returning();

      expect(created.id).toBeDefined();
      expect(created.name).toBe('Mobile Engineering');
      expect(created.slug).toBe('mobile-engineering');
      expect(created.isActive).toBe(true);
      expect(created.createdAt).toBeDefined();
    });

    it('should enforce UNIQUE constraint on category name', async () => {
      await expect(
        db.insert(categories).values({
          name: 'Web Engineering', // duplicate of testCategoryId
          slug: 'unique-slug-1',
          description: 'Duplicate name',
        })
      ).rejects.toThrow();
    });

    it('should enforce UNIQUE constraint on category slug', async () => {
      await expect(
        db.insert(categories).values({
          name: 'Completely New Category',
          slug: 'web-engineering', // duplicate slug of testCategoryId
          description: 'Duplicate slug',
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 3. COURSE TESTS
  // ==========================================
  describe('3. Courses Schema & Constraints', () => {
    it('should insert a course with valid category, instructor, and defaults', async () => {
      const [course] = await db
        .insert(courses)
        .values({
          categoryId: testCategoryId,
          instructorId: testInstructorId,
          title: 'Full-Stack NestJS Masterclass',
          slug: 'fullstack-nestjs-masterclass',
          shortDescription: 'Enterprise backend development with NestJS and PostgreSQL',
          description: 'In-depth architecture and design patterns with NestJS.',
          price: '99.99',
          currency: 'USD',
          level: 'ADVANCED',
          language: 'English',
          durationMinutes: 600,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
        })
        .returning();

      expect(course.id).toBeDefined();
      expect(course.title).toBe('Full-Stack NestJS Masterclass');
      expect(course.slug).toBe('fullstack-nestjs-masterclass');
      expect(course.status).toBe('PUBLISHED');
      expect(course.visibility).toBe('PUBLIC');
      expect(course.level).toBe('ADVANCED');
      expect(Number(course.price)).toBe(99.99);
    });

    it('should enforce UNIQUE constraint on course slug', async () => {
      await db.insert(courses).values({
        categoryId: testCategoryId,
        instructorId: testInstructorId,
        title: 'Original Course',
        slug: 'unique-course-slug',
      });

      await expect(
        db.insert(courses).values({
          categoryId: testCategoryId,
          instructorId: testInstructorId,
          title: 'Another Course with same slug',
          slug: 'unique-course-slug',
        })
      ).rejects.toThrow();
    });

    it('should reject course insertion with invalid foreign key categoryId', async () => {
      const fakeCategoryId = '00000000-0000-0000-0000-999999999999';
      await expect(
        db.insert(courses).values({
          categoryId: fakeCategoryId,
          instructorId: testInstructorId,
          title: 'Course with Invalid Category',
          slug: 'invalid-cat-course',
        })
      ).rejects.toThrow();
    });

    it('should reject course insertion with invalid foreign key instructorId', async () => {
      const fakeInstructorId = '00000000-0000-0000-0000-888888888888';
      await expect(
        db.insert(courses).values({
          categoryId: testCategoryId,
          instructorId: fakeInstructorId,
          title: 'Course with Invalid Instructor',
          slug: 'invalid-inst-course',
        })
      ).rejects.toThrow();
    });

    it('should prevent deletion of category with active courses (ON DELETE RESTRICT)', async () => {
      await db.insert(courses).values({
        categoryId: testCategoryId,
        instructorId: testInstructorId,
        title: 'Course Belonging to Category',
        slug: 'cat-owned-course',
      });

      // Deleting category should fail because of RESTRICT foreign key
      await expect(
        db.delete(categories).where(eq(categories.id, testCategoryId))
      ).rejects.toThrow();
    });
  });

  // ==========================================
  // 4. MODULE & LESSON CASCADE TESTS
  // ==========================================
  describe('4. Modules and Lessons Hierarchy & Cascade Behaviors', () => {
    let testCourseId: string;

    beforeEach(async () => {
      const [c] = await db
        .insert(courses)
        .values({
          categoryId: testCategoryId,
          instructorId: testInstructorId,
          title: 'Curriculum Hierarchy Course',
          slug: 'curriculum-hierarchy-course',
        })
        .returning();
      testCourseId = c.id;
    });

    it('should enforce UNIQUE constraint on (courseId, position) for modules', async () => {
      await db.insert(modules).values({
        courseId: testCourseId,
        title: 'Module 1',
        position: 1,
      });

      await expect(
        db.insert(modules).values({
          courseId: testCourseId,
          title: 'Duplicate Position Module',
          position: 1, // duplicate position in same course
        })
      ).rejects.toThrow();
    });

    it('should allow modules with distinct positions in the same course', async () => {
      const [m1] = await db
        .insert(modules)
        .values({
          courseId: testCourseId,
          title: 'Module 1',
          position: 1,
        })
        .returning();

      const [m2] = await db
        .insert(modules)
        .values({
          courseId: testCourseId,
          title: 'Module 2',
          position: 2,
        })
        .returning();

      expect(m1.id).toBeDefined();
      expect(m2.id).toBeDefined();
      expect(m1.position).toBe(1);
      expect(m2.position).toBe(2);
    });

    it('should enforce UNIQUE constraint on (moduleId, position) for lessons', async () => {
      const [mod] = await db
        .insert(modules)
        .values({
          courseId: testCourseId,
          title: 'Module with Lessons',
          position: 1,
        })
        .returning();

      await db.insert(lessons).values({
        moduleId: mod.id,
        title: 'Lesson 1',
        position: 1,
        lessonType: 'VIDEO',
      });

      await expect(
        db.insert(lessons).values({
          moduleId: mod.id,
          title: 'Duplicate Lesson Position',
          position: 1, // duplicate position in same module
          lessonType: 'TEXT',
        })
      ).rejects.toThrow();
    });

    it('should CASCADE delete modules and lessons when course is deleted', async () => {
      const [mod] = await db
        .insert(modules)
        .values({
          courseId: testCourseId,
          title: 'Cascade Module',
          position: 1,
        })
        .returning();

      const [les] = await db
        .insert(lessons)
        .values({
          moduleId: mod.id,
          title: 'Cascade Lesson',
          position: 1,
          lessonType: 'VIDEO',
        })
        .returning();

      // Verify records exist
      const modBefore = await db.select().from(modules).where(eq(modules.id, mod.id));
      const lesBefore = await db.select().from(lessons).where(eq(lessons.id, les.id));
      expect(modBefore.length).toBe(1);
      expect(lesBefore.length).toBe(1);

      // Delete parent course
      await db.delete(courses).where(eq(courses.id, testCourseId));

      // Verify cascading deletion
      const modAfter = await db.select().from(modules).where(eq(modules.id, mod.id));
      const lesAfter = await db.select().from(lessons).where(eq(lessons.id, les.id));
      expect(modAfter.length).toBe(0);
      expect(lesAfter.length).toBe(0);
    });

    it('should SET NULL on lesson media_id when referenced media record is deleted', async () => {
      const [mediaRecord] = await db
        .insert(media)
        .values({
          storageProvider: 'CLOUDINARY',
          storageKey: 'techsprout/videos/lesson_123',
          publicUrl: 'https://res.cloudinary.com/test/video.mp4',
          originalFilename: 'lesson.mp4',
          mimeType: 'video/mp4',
          fileSize: 1048576,
          durationSeconds: 300,
        })
        .returning();

      const [mod] = await db
        .insert(modules)
        .values({
          courseId: testCourseId,
          title: 'Module With Video',
          position: 1,
        })
        .returning();

      const [les] = await db
        .insert(lessons)
        .values({
          moduleId: mod.id,
          title: 'Video Lesson',
          position: 1,
          lessonType: 'VIDEO',
          mediaId: mediaRecord.id,
        })
        .returning();

      expect(les.mediaId).toBe(mediaRecord.id);

      // Delete media record
      await db.delete(media).where(eq(media.id, mediaRecord.id));

      // Lesson must still exist with mediaId set to null
      const [lesAfter] = await db.select().from(lessons).where(eq(lessons.id, les.id));
      expect(lesAfter).toBeDefined();
      expect(lesAfter.mediaId).toBeNull();
    });
  });

  // ==========================================
  // 5. MEDIA PERSISTENCE & FAILURE COMPENSATION
  // ==========================================
  describe('5. Media Service Persistence & Failure Handling', () => {
    it('should enforce UNIQUE constraint on media storage_key', async () => {
      await db.insert(media).values({
        storageProvider: 'CLOUDINARY',
        storageKey: 'techsprout/images/unique_key',
        publicUrl: 'https://res.cloudinary.com/test/image.jpg',
        originalFilename: 'image.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
      });

      await expect(
        db.insert(media).values({
          storageProvider: 'CLOUDINARY',
          storageKey: 'techsprout/images/unique_key', // duplicate storageKey
          publicUrl: 'https://res.cloudinary.com/test/image2.jpg',
          originalFilename: 'image2.jpg',
          mimeType: 'image/jpeg',
          fileSize: 2048,
        })
      ).rejects.toThrow();
    });

    it('CASE C: uploadImage should persist PostgreSQL record and return database id', async () => {
      const mockFile = {
        buffer: Buffer.from('fake image content'),
        mimetype: 'image/png',
        originalname: 'test-diagram.png',
        size: 5120,
      };

      const result = await mediaService.uploadImage(mockFile, {
        folder: 'techsprout/images/courses',
        customIdentifier: 'test-diagram',
      });

      expect(result.id).toBeDefined();
      expect(result.publicId).toBeDefined();
      expect(result.secureUrl).toBeDefined();

      // Check PostgreSQL record
      const [persisted] = await db
        .select()
        .from(media)
        .where(eq(media.id, result.id));

      expect(persisted).toBeDefined();
      expect(persisted.storageKey).toBe(result.publicId);
      expect(persisted.storageProvider).toBe('CLOUDINARY');
      expect(persisted.originalFilename).toBe('test-diagram.png');
      expect(persisted.fileSize).toBe(result.bytes);

      const metadata = JSON.parse(persisted.metadata);
      expect(metadata.width).toBe(800);
      expect(metadata.height).toBe(600);
    });

    it('CASE A: Cloudinary upload failure does not create any database record', async () => {
      mockCloudinaryClient.uploader.upload_stream = vi.fn((opts, cb) => {
        const { Writable } = require('stream');
        const s = new Writable({
          write(chunk, enc, next) {
            next();
          },
        });
        s.on('finish', () => {
          cb(new Error('Cloudinary Connection Error'));
        });
        return s;
      });

      const initialCount = (await db.select().from(media)).length;

      const mockFile = {
        buffer: Buffer.from('fake image content'),
        mimetype: 'image/jpeg',
        originalname: 'fail.jpg',
      };

      await expect(mediaService.uploadImage(mockFile)).rejects.toThrow(ApiException);

      const finalCount = (await db.select().from(media)).length;
      expect(finalCount).toBe(initialCount);
    });

    it('CASE B: DB persistence failure triggers Cloudinary compensation cleanup', async () => {
      // Mock db.insert to throw an error
      const originalInsert = db.insert.bind(db);
      vi.spyOn(db, 'insert').mockImplementation((table: any) => {
        if (table === media) {
          return {
            values: () => ({
              returning: () => Promise.reject(new Error('Simulated Database Crash')),
            }),
          } as any;
        }
        return originalInsert(table);
      });

      const mockFile = {
        buffer: Buffer.from('fake image content'),
        mimetype: 'image/jpeg',
        originalname: 'compensated.jpg',
      };

      await expect(mediaService.uploadImage(mockFile)).rejects.toThrow(ApiException);

      // Verify Cloudinary compensation was triggered
      expect(mockCloudinaryClient.uploader.destroy).toHaveBeenCalled();
    });

    it('should delete from Cloudinary and remove PostgreSQL row on deleteImage', async () => {
      const [rec] = await db
        .insert(media)
        .values({
          storageProvider: 'CLOUDINARY',
          storageKey: 'techsprout/images/to_delete',
          publicUrl: 'https://res.cloudinary.com/test/to_delete.jpg',
          originalFilename: 'to_delete.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
        })
        .returning();

      const delResult = await mediaService.deleteImage('techsprout/images/to_delete');
      expect(delResult.result).toBe('ok');

      const [afterDel] = await db
        .select()
        .from(media)
        .where(eq(media.id, rec.id));

      expect(afterDel).toBeUndefined();
    });
  });

  // ==========================================
  // 6. SEED IDEMPOTENCY & DATA INTEGRITY TESTS
  // ==========================================
  describe('6. Catalog Seeder Idempotency & Relationships', () => {
    it('should seed categories, courses, modules, and lessons successfully', async () => {
      const result = await seedCatalog(db, testInstructorId);

      expect(result.categoriesSeeded).toBe(SEED_CATEGORIES.length);
      expect(result.coursesSeeded).toBe(SEED_COURSES.length);
      expect(result.modulesSeeded).toBe(22); // 11 courses * 2 modules
      expect(result.lessonsSeeded).toBe(44); // 22 modules * 2 lessons

      const allCategories = await db.select().from(categories);
      expect(allCategories.length).toBe(SEED_CATEGORIES.length + 1); // including testCategoryId

      const allCourses = await db.select().from(courses);
      expect(allCourses.length).toBe(SEED_COURSES.length);

      const allModules = await db.select().from(modules);
      expect(allModules.length).toBe(22);

      const allLessons = await db.select().from(lessons);
      expect(allLessons.length).toBe(44);
    });

    it('should be completely idempotent when seedCatalog is executed a second time', async () => {
      // First execution
      await seedCatalog(db, testInstructorId);

      const countCategories1 = (await db.select().from(categories)).length;
      const countCourses1 = (await db.select().from(courses)).length;
      const countModules1 = (await db.select().from(modules)).length;
      const countLessons1 = (await db.select().from(lessons)).length;

      // Second execution
      const secondResult = await seedCatalog(db, testInstructorId);

      const countCategories2 = (await db.select().from(categories)).length;
      const countCourses2 = (await db.select().from(courses)).length;
      const countModules2 = (await db.select().from(modules)).length;
      const countLessons2 = (await db.select().from(lessons)).length;

      expect(countCategories2).toBe(countCategories1);
      expect(countCourses2).toBe(countCourses1);
      expect(countModules2).toBe(countModules1);
      expect(countLessons2).toBe(countLessons1);
    });

    it('should verify all seeded courses have valid categories and instructors', async () => {
      await seedCatalog(db, testInstructorId);

      const allCourses = await db.select().from(courses);
      for (const course of allCourses) {
        // Valid Category relationship
        const [cat] = await db
          .select()
          .from(categories)
          .where(eq(categories.id, course.categoryId))
          .limit(1);
        expect(cat).toBeDefined();

        // Valid Instructor relationship
        const [inst] = await db
          .select()
          .from(users)
          .where(eq(users.id, course.instructorId))
          .limit(1);
        expect(inst).toBeDefined();

        // Valid Status and Visibility
        expect(['DRAFT', 'PUBLISHED', 'ARCHIVED']).toContain(course.status);
        expect(['PUBLIC', 'PRIVATE']).toContain(course.visibility);
      }
    });

    it('should verify all modules and lessons maintain unique ordering within parent', async () => {
      await seedCatalog(db, testInstructorId);

      const allCourses = await db.select().from(courses);
      for (const course of allCourses) {
        const courseModules = await db
          .select()
          .from(modules)
          .where(eq(modules.courseId, course.id));

        expect(courseModules.length).toBe(2);
        const modPositions = courseModules.map((m: any) => m.position);
        expect(new Set(modPositions).size).toBe(modPositions.length); // no duplicates

        for (const mod of courseModules) {
          const modLessons = await db
            .select()
            .from(lessons)
            .where(eq(lessons.moduleId, mod.id));

          expect(modLessons.length).toBe(2);
          const lesPositions = modLessons.map((l: any) => l.position);
          expect(new Set(lesPositions).size).toBe(lesPositions.length); // no duplicates
        }
      }
    });
  });
});
