import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  enrollments,
  courses,
  categories,
  users,
  modules,
  lessons,
  lessonProgress,
  media,
  certificates,
  Enrollment,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import { QueryEnrollmentsDto } from './dto/query-enrollments.dto';
import { AdminQueryCourseEnrollmentsDto } from './dto/admin-query-course-enrollments.dto';
import { UserContext } from '../courses/courses.service';

@Injectable()
export class EnrollmentsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  private formatEnrollmentDto(enrollment: Enrollment, progressPercentage = 0) {
    return {
      id: enrollment.id,
      courseId: enrollment.courseId,
      studentId: enrollment.studentId,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      startedAt: enrollment.startedAt ? enrollment.startedAt.toISOString() : null,
      completedAt: enrollment.completedAt ? enrollment.completedAt.toISOString() : null,
      progressPercentage,
    };
  }

  /**
   * Helper: calculate course progress and enforce the invariant:
   * status === 'COMPLETED' <=> progressPercentage === 100 <=> completedAt !== null
   */
  async calculateCourseProgress(
    courseId: string,
    enrollmentId: string
  ): Promise<{
    totalLessons: number;
    completedLessons: number;
    percentage: number;
  }> {
    const [totalResult] = await this.db
      .select({ count: count(lessons.id) })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId));

    const totalLessons = Number(totalResult?.count || 0);

    const [completedResult] = await this.db
      .select({ count: count(lessonProgress.id) })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(
        and(
          eq(lessonProgress.enrollmentId, enrollmentId),
          eq(modules.courseId, courseId),
          eq(lessonProgress.status, 'COMPLETED')
        )
      );

    const completedLessons = Number(completedResult?.count || 0);
    const percentage = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

    return { totalLessons, completedLessons, percentage };
  }

  /**
   * Ensure enrollment completion status matches actual progress
   */
  async syncEnrollmentCompletionInvariant(
    enrollment: Enrollment,
    totalLessons: number,
    completedLessons: number
  ): Promise<Enrollment> {
    if (completedLessons < totalLessons && enrollment.status === 'COMPLETED') {
      const [updated] = await this.db
        .update(enrollments)
        .set({
          status: 'ACTIVE',
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(enrollments.id, enrollment.id))
        .returning();
      return updated;
    }

    if (
      totalLessons > 0 &&
      completedLessons === totalLessons &&
      enrollment.status !== 'COMPLETED'
    ) {
      const [updated] = await this.db
        .update(enrollments)
        .set({
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(enrollments.id, enrollment.id))
        .returning();

      await this.auditService.record({
        actorId: enrollment.studentId,
        action: 'ENROLLMENT_COMPLETED',
        targetType: 'ENROLLMENT',
        targetId: enrollment.id,
        metadata: {
          studentId: enrollment.studentId,
          courseId: enrollment.courseId,
          completedAt: updated.completedAt,
          totalLessonsCount: totalLessons,
        },
      });

      return updated;
    }

    return enrollment;
  }

  /**
   * Self-enrollment: POST /api/v1/enrollments
   * studentId is derived strictly from req.user.id
   */
  async selfEnroll(
    studentId: string,
    courseId: string,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<{
    statusCode: number;
    message: string;
    data: ReturnType<typeof EnrollmentsService.prototype.formatEnrollmentDto>;
  }> {
    // 1. Fetch course & category
    const [courseResult] = await this.db
      .select({
        course: courses,
        category: categories,
      })
      .from(courses)
      .innerJoin(categories, eq(courses.categoryId, categories.id))
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!courseResult || courseResult.course.status === 'DRAFT') {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (!courseResult.category.isActive) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (courseResult.course.status === 'ARCHIVED') {
      throw new ApiException(
        'Course is archived; new enrollments are closed',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'COURSE_ARCHIVED'
      );
    }

    if (courseResult.course.visibility === 'PRIVATE') {
      throw new ApiException(
        'Course is private; administrative assignment required',
        HttpStatus.FORBIDDEN,
        'PRIVATE_COURSE'
      );
    }

    if (parseFloat(courseResult.course.price) > 0) {
      throw new ApiException(
        'Course requires payment; checkout required',
        HttpStatus.PAYMENT_REQUIRED,
        'PAYMENT_REQUIRED'
      );
    }

    // 2. Check duplicate / existing enrollment
    const [existing] = await this.db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)))
      .limit(1);

    if (existing) {
      if (existing.status === 'ACTIVE') {
        const progress = await this.calculateCourseProgress(courseId, existing.id);
        return {
          statusCode: HttpStatus.OK,
          message: 'Already enrolled in this course',
          data: this.formatEnrollmentDto(existing, progress.percentage),
        };
      }

      if (existing.status === 'COMPLETED') {
        return {
          statusCode: HttpStatus.OK,
          message: 'Course already completed',
          data: this.formatEnrollmentDto(existing, 100),
        };
      }

      if (existing.status === 'CANCELLED') {
        // Reactivate enrollment and preserve progress
        const [reactivated] = await this.db
          .update(enrollments)
          .set({
            status: 'ACTIVE',
            enrolledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(enrollments.id, existing.id))
          .returning();

        await this.auditService.record({
          actorId: studentId,
          action: 'ENROLLMENT_CREATED',
          targetType: 'ENROLLMENT',
          targetId: reactivated.id,
          ipAddress,
          userAgent,
          requestId,
          metadata: {
            studentId,
            courseId,
            enrolledBy: studentId,
            type: 'SELF',
            reactivated: true,
          },
        });

        const progress = await this.calculateCourseProgress(courseId, reactivated.id);
        return {
          statusCode: HttpStatus.OK,
          message: 'Course enrollment successful',
          data: this.formatEnrollmentDto(reactivated, progress.percentage),
        };
      }
    }

    // 3. Insert new enrollment
    const [created] = await this.db
      .insert(enrollments)
      .values({
        studentId,
        courseId,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      })
      .returning();

    await this.auditService.record({
      actorId: studentId,
      action: 'ENROLLMENT_CREATED',
      targetType: 'ENROLLMENT',
      targetId: created.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        studentId,
        courseId,
        enrolledBy: studentId,
        type: 'SELF',
        reactivated: false,
      },
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Course enrollment successful',
      data: this.formatEnrollmentDto(created, 0),
    };
  }

  /**
   * Admin-assigned enrollment: POST /api/v1/admin/courses/:courseId/enrollments
   * Accessible only to admin
   */
  async adminAssignEnrollment(
    adminId: string,
    courseId: string,
    targetStudentId: string,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<{
    statusCode: number;
    message: string;
    data: ReturnType<typeof EnrollmentsService.prototype.formatEnrollmentDto>;
  }> {
    // 1. Validate target student exists and is active
    const [targetUser] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, targetStudentId))
      .limit(1);

    if (!targetUser) {
      throw new ApiException('Target student not found', HttpStatus.NOT_FOUND, 'STUDENT_NOT_FOUND');
    }

    if (!targetUser.isActive) {
      throw new ApiException(
        'Target student account is inactive or suspended',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'STUDENT_INELIGIBLE'
      );
    }

    // 2. Validate course exists and eligibility
    const [course] = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

    if (!course || course.status === 'DRAFT') {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (course.status === 'ARCHIVED') {
      throw new ApiException(
        'Course is archived; new enrollments are closed',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'COURSE_ARCHIVED'
      );
    }

    // 3. Check existing enrollment & idempotency
    const [existing] = await this.db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, targetStudentId), eq(enrollments.courseId, courseId)))
      .limit(1);

    if (existing) {
      if (existing.status === 'ACTIVE') {
        const progress = await this.calculateCourseProgress(courseId, existing.id);
        return {
          statusCode: HttpStatus.OK,
          message: 'Student is already enrolled in this course',
          data: this.formatEnrollmentDto(existing, progress.percentage),
        };
      }

      if (existing.status === 'COMPLETED') {
        return {
          statusCode: HttpStatus.OK,
          message: 'Course already completed',
          data: this.formatEnrollmentDto(existing, 100),
        };
      }

      if (existing.status === 'CANCELLED') {
        const [reactivated] = await this.db
          .update(enrollments)
          .set({
            status: 'ACTIVE',
            enrolledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(enrollments.id, existing.id))
          .returning();

        await this.auditService.record({
          actorId: adminId,
          action: 'ENROLLMENT_CREATED',
          targetType: 'ENROLLMENT',
          targetId: reactivated.id,
          ipAddress,
          userAgent,
          requestId,
          metadata: {
            studentId: targetStudentId,
            courseId,
            enrolledBy: adminId,
            type: 'ADMIN_ASSIGNED',
            reactivated: true,
          },
        });

        const progress = await this.calculateCourseProgress(courseId, reactivated.id);
        return {
          statusCode: HttpStatus.OK,
          message: 'Student successfully enrolled by administrator',
          data: this.formatEnrollmentDto(reactivated, progress.percentage),
        };
      }
    }

    // 4. Create new enrollment
    const [created] = await this.db
      .insert(enrollments)
      .values({
        studentId: targetStudentId,
        courseId,
        status: 'ACTIVE',
        enrolledAt: new Date(),
      })
      .returning();

    await this.auditService.record({
      actorId: adminId,
      action: 'ENROLLMENT_CREATED',
      targetType: 'ENROLLMENT',
      targetId: created.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        studentId: targetStudentId,
        courseId,
        enrolledBy: adminId,
        type: 'ADMIN_ASSIGNED',
        reactivated: false,
      },
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Student successfully enrolled by administrator',
      data: this.formatEnrollmentDto(created, 0),
    };
  }

  /**
   * List authenticated student's enrolled courses: GET /api/v1/enrollments
   */
  async getMyEnrollments(studentId: string, query: QueryEnrollmentsDto) {
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const baseWhere = query.status
      ? and(eq(enrollments.studentId, studentId), eq(enrollments.status, query.status))
      : eq(enrollments.studentId, studentId);

    // Count total enrollments for pagination
    const [countResult] = await this.db
      .select({ count: count(enrollments.id) })
      .from(enrollments)
      .where(baseWhere);

    const total = Number(countResult?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch paginated enrollments with certificate existence via single left join
    const userEnrollments = await this.db
      .select({
        enrollment: enrollments,
        hasCertificate: sql<boolean>`CASE WHEN ${certificates.id} IS NOT NULL THEN TRUE ELSE FALSE END`,
      })
      .from(enrollments)
      .leftJoin(
        certificates,
        and(
          eq(certificates.enrollmentId, enrollments.id),
          eq(certificates.studentId, studentId)
        )
      )
      .where(baseWhere)
      .orderBy(desc(enrollments.enrolledAt))
      .limit(limit)
      .offset(offset);

    // Enrich each enrollment with course, progress, and resume point
    const items = await Promise.all(
      userEnrollments.map(async ({ enrollment, hasCertificate }) => {
        // Fetch course, category, instructor, thumbnail
        const [courseRecord] = await this.db
          .select({
            course: courses,
            category: categories,
            instructor: users,
            mediaRecord: media,
          })
          .from(courses)
          .innerJoin(categories, eq(courses.categoryId, categories.id))
          .innerJoin(users, eq(courses.instructorId, users.id))
          .leftJoin(media, eq(courses.thumbnailMediaId, media.id))
          .where(eq(courses.id, enrollment.courseId))
          .limit(1);

        // Calculate progress
        const { totalLessons, completedLessons, percentage } = await this.calculateCourseProgress(
          enrollment.courseId,
          enrollment.id
        );

        // Sync invariant if completed course has new lessons
        const syncedEnrollment = await this.syncEnrollmentCompletionInvariant(
          enrollment,
          totalLessons,
          completedLessons
        );

        // Resolve resumePoint
        let resumePoint: {
          lessonId: string;
          moduleId: string;
          lessonTitle: string;
          watchPositionSeconds: number;
        } | null = null;

        // Query lessons in curricular order
        const courseLessons = await this.db
          .select({
            lesson: lessons,
            moduleId: modules.id,
            modulePosition: modules.position,
          })
          .from(lessons)
          .innerJoin(modules, eq(lessons.moduleId, modules.id))
          .where(eq(modules.courseId, enrollment.courseId))
          .orderBy(modules.position, lessons.position);

        if (courseLessons.length > 0) {
          // Fetch existing progress
          const progressRows = await this.db
            .select()
            .from(lessonProgress)
            .where(eq(lessonProgress.enrollmentId, enrollment.id));

          const progressMap = new Map(progressRows.map((p) => [p.lessonId, p]));

          // 1. Most recently accessed IN_PROGRESS lesson
          const inProgress = progressRows
            .filter((p) => p.status === 'IN_PROGRESS')
            .sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());

          if (inProgress.length > 0) {
            const activeLessonProgress = inProgress[0];
            const found = courseLessons.find((l) => l.lesson.id === activeLessonProgress.lessonId);
            if (found) {
              let watchPos = activeLessonProgress.watchPositionSeconds;
              if (
                found.lesson.lessonType === 'VIDEO' &&
                found.lesson.durationSeconds > 0 &&
                watchPos >= Math.floor(0.95 * found.lesson.durationSeconds)
              ) {
                watchPos = 0;
              }
              resumePoint = {
                lessonId: found.lesson.id,
                moduleId: found.moduleId,
                lessonTitle: found.lesson.title,
                watchPositionSeconds: watchPos,
              };
            }
          }

          // 2. Otherwise first incomplete lesson
          if (!resumePoint) {
            const firstIncomplete = courseLessons.find((l) => {
              const p = progressMap.get(l.lesson.id);
              return !p || p.status !== 'COMPLETED';
            });

            if (firstIncomplete) {
              const p = progressMap.get(firstIncomplete.lesson.id);
              let watchPos = p?.watchPositionSeconds || 0;
              if (
                firstIncomplete.lesson.lessonType === 'VIDEO' &&
                firstIncomplete.lesson.durationSeconds > 0 &&
                watchPos >= Math.floor(0.95 * firstIncomplete.lesson.durationSeconds)
              ) {
                watchPos = 0;
              }
              resumePoint = {
                lessonId: firstIncomplete.lesson.id,
                moduleId: firstIncomplete.moduleId,
                lessonTitle: firstIncomplete.lesson.title,
                watchPositionSeconds: watchPos,
              };
            }
          }
        }

        return {
          enrollmentId: syncedEnrollment.id,
          status: syncedEnrollment.status,
          hasCertificate: Boolean(hasCertificate),
          enrolledAt: syncedEnrollment.enrolledAt.toISOString(),
          startedAt: syncedEnrollment.startedAt ? syncedEnrollment.startedAt.toISOString() : null,
          completedAt: syncedEnrollment.completedAt
            ? syncedEnrollment.completedAt.toISOString()
            : null,
          progress: {
            completedLessons,
            totalLessons,
            percentage,
          },
          resumePoint,
          course: {
            id: courseRecord.course.id,
            title: courseRecord.course.title,
            slug: courseRecord.course.slug,
            status: courseRecord.course.status,
            thumbnailUrl: courseRecord.mediaRecord?.publicUrl || null,
            category: {
              id: courseRecord.category.id,
              name: courseRecord.category.name,
              slug: courseRecord.category.slug,
            },
            instructor: {
              id: courseRecord.instructor.id,
              name: courseRecord.instructor.name,
            },
          },
        };
      })
    );

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Enrollment status lookup: GET /api/v1/courses/:courseId/enrollment
   */
  async getCourseEnrollmentStatus(studentId: string, courseId: string) {
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)))
      .limit(1);

    if (!enrollment) {
      return {
        isEnrolled: false,
        enrollment: null,
      };
    }

    const { totalLessons, completedLessons, percentage } = await this.calculateCourseProgress(
      courseId,
      enrollment.id
    );

    const synced = await this.syncEnrollmentCompletionInvariant(
      enrollment,
      totalLessons,
      completedLessons
    );

    const isEnrolled = synced.status === 'ACTIVE' || synced.status === 'COMPLETED';

    return {
      isEnrolled,
      enrollment: {
        id: synced.id,
        status: synced.status,
        enrolledAt: synced.enrolledAt.toISOString(),
        progressPercentage: percentage,
      },
    };
  }

  /**
   * Cancel enrollment: POST /api/v1/enrollments/:id/cancel
   */
  async cancelEnrollment(
    enrollmentId: string,
    actor: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ) {
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment) {
      throw new ApiException(
        'Enrollment record not found',
        HttpStatus.NOT_FOUND,
        'ENROLLMENT_NOT_FOUND'
      );
    }

    // Ownership check: must be owner or admin
    if (actor.role !== 'admin' && enrollment.studentId !== actor.id) {
      throw new ApiException(
        'Access denied: cannot cancel another student enrollment',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    if (enrollment.status === 'CANCELLED') {
      return {
        id: enrollment.id,
        status: 'CANCELLED',
      };
    }

    const [updated] = await this.db
      .update(enrollments)
      .set({
        status: 'CANCELLED',
        updatedAt: new Date(),
      })
      .where(eq(enrollments.id, enrollmentId))
      .returning();

    await this.auditService.record({
      actorId: actor.id,
      action: 'ENROLLMENT_CANCELLED',
      targetType: 'ENROLLMENT',
      targetId: updated.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        studentId: updated.studentId,
        courseId: updated.courseId,
        cancelledBy: actor.id,
      },
    });

    return {
      id: updated.id,
      status: 'CANCELLED',
    };
  }

  /**
   * Admin / Instructor roster: GET /api/v1/admin/courses/:id/enrollments
   */
  async getAdminCourseEnrollments(
    courseId: string,
    actor: UserContext,
    query: AdminQueryCourseEnrollmentsDto
  ) {
    const [course] = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    if (actor.role === 'instructor' && course.instructorId !== actor.id) {
      throw new ApiException(
        'Access denied: you do not own this course',
        HttpStatus.FORBIDDEN,
        'NOT_COURSE_OWNER'
      );
    }

    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const baseWhere = query.status
      ? and(eq(enrollments.courseId, courseId), eq(enrollments.status, query.status))
      : eq(enrollments.courseId, courseId);

    const [totalCountResult] = await this.db
      .select({ count: count(enrollments.id) })
      .from(enrollments)
      .where(baseWhere);

    const [completedCountResult] = await this.db
      .select({ count: count(enrollments.id) })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, courseId), eq(enrollments.status, 'COMPLETED')));

    const total = Number(totalCountResult?.count || 0);
    const completedCount = Number(completedCountResult?.count || 0);
    const totalPages = Math.ceil(total / limit) || 1;

    const courseEnrollmentRows = await this.db
      .select({
        enrollment: enrollments,
        student: users,
      })
      .from(enrollments)
      .innerJoin(users, eq(enrollments.studentId, users.id))
      .where(baseWhere)
      .orderBy(desc(enrollments.enrolledAt))
      .limit(limit)
      .offset(offset);

    const items = await Promise.all(
      courseEnrollmentRows.map(async ({ enrollment, student }) => {
        const { percentage } = await this.calculateCourseProgress(courseId, enrollment.id);
        return {
          enrollmentId: enrollment.id,
          student: {
            id: student.id,
            name: student.name,
            email: student.email,
          },
          status: enrollment.status,
          enrolledAt: enrollment.enrolledAt.toISOString(),
          completedAt: enrollment.completedAt ? enrollment.completedAt.toISOString() : null,
          lastAccessedAt: enrollment.lastAccessedAt
            ? enrollment.lastAccessedAt.toISOString()
            : null,
          progressPercentage: percentage,
        };
      })
    );

    return {
      courseId,
      totalEnrolled: total,
      completedCount,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}
