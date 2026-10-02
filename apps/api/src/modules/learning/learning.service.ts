import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, sql, count, inArray } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  enrollments,
  courses,
  modules,
  lessons,
  lessonProgress,
  media,
  quizzes,
  quizAttempts,
  quizQuestions,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { CertificateService } from '../certificates/certificates.service';
import { ApiException } from '../../common/errors/api-error';
import { UserContext } from '../courses/courses.service';
import {
  CurriculumItemDto,
  CurriculumLessonDto,
  CurriculumLessonItemDto,
  CurriculumQuizItemDto,
} from './dto/curriculum.dto';

@Injectable()
export class LearningService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(CertificateService) private readonly certificateService: CertificateService
  ) {}

  /**
   * Helper: verify learner enrollment or administrative access
   */
  private async verifyLearnerAccess(courseId: string, user: UserContext) {
    const [course] = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    // Admins and course owner instructors have institutional access
    if (user.role === 'admin' || (user.role === 'instructor' && course.instructorId === user.id)) {
      return { course, enrollment: null };
    }

    // Students / learner instructors must possess an active or completed enrollment
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, user.id),
          eq(enrollments.courseId, courseId),
          sql`${enrollments.status} IN ('ACTIVE', 'COMPLETED')`
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new ApiException(
        'Access denied: Enrollment required to view this course',
        HttpStatus.FORBIDDEN,
        'ENROLLMENT_REQUIRED'
      );
    }

    return { course, enrollment };
  }

  /**
   * Helper: verify strict student enrollment for learning mutations
   */
  private async verifyStudentEnrollment(courseId: string, studentId: string) {
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, studentId),
          eq(enrollments.courseId, courseId),
          sql`${enrollments.status} IN ('ACTIVE', 'COMPLETED')`
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new ApiException(
        'Access denied: Enrollment required to view this lesson',
        HttpStatus.FORBIDDEN,
        'ENROLLMENT_REQUIRED'
      );
    }

    return enrollment;
  }

  /**
   * Helper: calculate course progress numbers
   */
  private async calculateProgress(courseId: string, enrollmentId: string) {
    const [totalLessonsResult] = await this.db
      .select({ count: count(lessons.id) })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId));

    const totalLessons = Number(totalLessonsResult?.count || 0);

    const [completedLessonsResult] = await this.db
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

    const completedLessons = Number(completedLessonsResult?.count || 0);

    // Published quizzes in course
    const [publishedQuizzesResult] = await this.db
      .select({ count: count(quizzes.id) })
      .from(quizzes)
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, courseId),
          eq(quizzes.status, 'PUBLISHED')
        )
      );

    const publishedQuizzes = Number(publishedQuizzesResult?.count || 0);

    // Distinct passed published quizzes
    const passedQuizzesRes = await this.db
      .select({ quizId: quizAttempts.quizId })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .where(
        and(
          eq(quizAttempts.enrollmentId, enrollmentId),
          eq(modules.courseId, courseId),
          eq(quizzes.status, 'PUBLISHED'),
          eq(quizAttempts.status, 'SUBMITTED'),
          eq(quizAttempts.isPassed, true)
        )
      )
      .groupBy(quizAttempts.quizId);

    const passedQuizzes = passedQuizzesRes.length;

    const totalItems = totalLessons + publishedQuizzes;
    const completedItems = completedLessons + passedQuizzes;
    const progressPercentage =
      totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);
    const isCourseCompleted = totalItems > 0 && completedItems === totalItems;

    return {
      totalLessons,
      completedLessons,
      publishedQuizzes,
      passedQuizzes,
      totalItems,
      completedItems,
      progressPercentage,
      isCourseCompleted,
    };
  }

  /**
   * GET /api/v1/learn/courses/:courseId/curriculum
   */
  async getCurriculum(courseId: string, user: UserContext) {
    const { course, enrollment } = await this.verifyLearnerAccess(courseId, user);

    // Fetch modules ordered by position
    const courseModules = await this.db
      .select()
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .orderBy(modules.position);

    // Fetch lessons ordered by module position and lesson position
    const courseLessons = await this.db
      .select({
        lesson: lessons,
        moduleId: modules.id,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId))
      .orderBy(modules.position, lessons.position);

    // Fetch published quizzes ordered by module position and quiz position
    const courseQuizzes = await this.db
      .select({
        quiz: quizzes,
        moduleId: modules.id,
      })
      .from(quizzes)
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, courseId),
          eq(quizzes.status, 'PUBLISHED')
        )
      )
      .orderBy(modules.position, quizzes.position);

    // Load question counts and points for published quizzes
    const quizIds = courseQuizzes.map((q) => q.quiz.id);
    const quizStatsMap = new Map<string, { questionsCount: number; totalPoints: number }>();
    for (const q of courseQuizzes) {
      quizStatsMap.set(q.quiz.id, { questionsCount: 0, totalPoints: 0 });
    }

    if (quizIds.length > 0) {
      const qQuestions = await this.db
        .select({
          quizId: quizQuestions.quizId,
          points: quizQuestions.points,
        })
        .from(quizQuestions)
        .where(inArray(quizQuestions.quizId, quizIds));

      for (const qq of qQuestions) {
        const stats = quizStatsMap.get(qq.quizId);
        if (stats) {
          stats.questionsCount += 1;
          stats.totalPoints += qq.points;
        }
      }
    }

    let progressPercentage = 0;
    let completedLessonsCount = 0;
    const totalLessonsCount = courseLessons.length;
    const progressMap = new Map<string, typeof lessonProgress.$inferSelect>();
    const quizAttemptStatsMap = new Map<
      string,
      { isPassed: boolean; userAttemptsCount: number; bestScorePercentage: number | null }
    >();
    for (const q of courseQuizzes) {
      quizAttemptStatsMap.set(q.quiz.id, {
        isPassed: false,
        userAttemptsCount: 0,
        bestScorePercentage: null,
      });
    }

    if (enrollment) {
      const progressRecords = await this.db
        .select()
        .from(lessonProgress)
        .where(eq(lessonProgress.enrollmentId, enrollment.id));

      for (const p of progressRecords) {
        progressMap.set(p.lessonId, p);
      }

      // Load student attempt evaluations on published quizzes
      if (quizIds.length > 0) {
        const attempts = await this.db
          .select({
            quizId: quizAttempts.quizId,
            status: quizAttempts.status,
            isPassed: quizAttempts.isPassed,
            percentage: quizAttempts.percentage,
          })
          .from(quizAttempts)
          .where(
            and(
              eq(quizAttempts.enrollmentId, enrollment.id),
              inArray(quizAttempts.quizId, quizIds)
            )
          );

        for (const att of attempts) {
          const stats = quizAttemptStatsMap.get(att.quizId);
          if (stats) {
            if (att.status === 'SUBMITTED' || att.status === 'ABANDONED') {
              stats.userAttemptsCount += 1;
            }
            if (att.status === 'SUBMITTED') {
              if (att.isPassed) {
                stats.isPassed = true;
              }
              if (att.percentage !== null && att.percentage !== undefined) {
                const numericPercentage = Number(att.percentage);
                stats.bestScorePercentage =
                  stats.bestScorePercentage === null
                    ? numericPercentage
                    : Math.max(stats.bestScorePercentage, numericPercentage);
              }
            }
          }
        }
      }

      completedLessonsCount = progressRecords.filter((p) => p.status === 'COMPLETED').length;
      const progress = await this.calculateProgress(courseId, enrollment.id);
      progressPercentage = progress.progressPercentage;

      // Invariant sync
      if (enrollment.status === 'COMPLETED' && !progress.isCourseCompleted) {
        await this.db
          .update(enrollments)
          .set({ status: 'ACTIVE', completedAt: null, updatedAt: new Date() })
          .where(eq(enrollments.id, enrollment.id));
      } else if (
        progress.isCourseCompleted &&
        enrollment.status !== 'COMPLETED'
      ) {
        const [updated] = await this.db
          .update(enrollments)
          .set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(enrollments.id, enrollment.id))
          .returning();

        await this.auditService.record({
          actorId: enrollment.studentId,
          action: 'ENROLLMENT_COMPLETED',
          targetType: 'ENROLLMENT',
          targetId: enrollment.id,
          metadata: {
            studentId: enrollment.studentId,
            courseId,
            completedAt: updated.completedAt,
            totalLessonsCount,
          },
        });
      }
    }

    const assembledModules = courseModules.map((mod) => {
      // 1. Backward-compatible lessons array
      const moduleLessons: CurriculumLessonDto[] = courseLessons
        .filter((l) => l.moduleId === mod.id)
        .map(({ lesson }) => {
          const lp = progressMap.get(lesson.id);
          return {
            id: lesson.id,
            title: lesson.title,
            position: lesson.position,
            lessonType: lesson.lessonType,
            durationSeconds: lesson.durationSeconds,
            isPreview: lesson.isPreview,
            progress: lp
              ? {
                  status: lp.status,
                  watchPositionSeconds: lp.watchPositionSeconds,
                  completedAt: lp.completedAt ? lp.completedAt.toISOString() : null,
                }
              : {
                  status: 'NOT_STARTED' as const,
                  watchPositionSeconds: 0,
                  completedAt: null,
                },
          };
        });

      // 2. Raw lesson items for unified collection
      const rawLessonItems: (CurriculumLessonItemDto & { rawPosition: number; createdAt: Date })[] =
        courseLessons
          .filter((l) => l.moduleId === mod.id)
          .map(({ lesson }) => {
            const lp = progressMap.get(lesson.id);
            return {
              type: 'LESSON' as const,
              id: lesson.id,
              title: lesson.title,
              position: lesson.position,
              rawPosition: lesson.position,
              lessonType: lesson.lessonType,
              durationSeconds: lesson.durationSeconds,
              isPreview: lesson.isPreview,
              createdAt: lesson.createdAt,
              progress: lp
                ? {
                    status: lp.status,
                    watchPositionSeconds: lp.watchPositionSeconds,
                    completedAt: lp.completedAt ? lp.completedAt.toISOString() : null,
                  }
                : {
                    status: 'NOT_STARTED' as const,
                    watchPositionSeconds: 0,
                    completedAt: null,
                  },
            };
          });

      // 3. Raw quiz items for unified collection
      const rawQuizItems: (CurriculumQuizItemDto & { rawPosition: number; createdAt: Date })[] =
        courseQuizzes
          .filter((q) => q.moduleId === mod.id)
          .map(({ quiz }) => {
            const stats = quizStatsMap.get(quiz.id) || { questionsCount: 0, totalPoints: 0 };
            const attemptStats = quizAttemptStatsMap.get(quiz.id) || {
              isPassed: false,
              userAttemptsCount: 0,
              bestScorePercentage: null,
            };
            return {
              type: 'QUIZ' as const,
              id: quiz.id,
              title: quiz.title,
              position: quiz.position,
              rawPosition: quiz.position,
              quizType: quiz.quizType,
              passingScorePercentage: quiz.passingScorePercentage,
              timeLimitMinutes: quiz.timeLimitMinutes,
              totalPoints: stats.totalPoints,
              questionsCount: stats.questionsCount,
              maxAttempts: quiz.maxAttempts,
              isPassed: attemptStats.isPassed,
              userAttemptsCount: attemptStats.userAttemptsCount,
              bestScorePercentage: attemptStats.bestScorePercentage,
              createdAt: quiz.createdAt,
            };
          });

      // 4. Merge and deterministically sort items
      const mergedCandidates = [...rawLessonItems, ...rawQuizItems];
      mergedCandidates.sort((a, b) => {
        // Primary: Author-configured integer position
        if (a.rawPosition !== b.rawPosition) {
          return a.rawPosition - b.rawPosition;
        }
        // Collision tie-breaker: LESSON precedes QUIZ (instruction before assessment)
        if (a.type !== b.type) {
          return a.type === 'LESSON' ? -1 : 1;
        }
        // Deterministic timestamp/ID fallback
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) {
          return timeA - timeB;
        }
        return a.id.localeCompare(b.id);
      });

      // 5. Normalize sequential 1-based position (1, 2, 3...)
      const moduleItems: CurriculumItemDto[] = mergedCandidates.map((item, idx) => {
        const { rawPosition, createdAt, ...cleanItem } = item;
        return {
          ...cleanItem,
          position: idx + 1,
        };
      });

      return {
        id: mod.id,
        title: mod.title,
        position: mod.position,
        lessons: moduleLessons,
        items: moduleItems,
      };
    });

    return {
      courseId,
      courseStatus: course.status,
      progressPercentage,
      completedLessonsCount,
      totalLessonsCount,
      publishedQuizzesCount: courseQuizzes.length,
      passedQuizzesCount: Array.from(quizAttemptStatsMap.values()).filter((s) => s.isPassed).length,
      modules: assembledModules,
    };
  }

  /**
   * GET /api/v1/learn/courses/:courseId/lessons/:lessonId
   */
  async getLessonContent(courseId: string, lessonId: string, user: UserContext) {
    // 1. Verify ancestry
    const [result] = await this.db
      .select({
        lesson: lessons,
        module: modules,
        course: courses,
        mediaRecord: media,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .leftJoin(media, eq(lessons.mediaId, media.id))
      .where(and(eq(lessons.id, lessonId), eq(courses.id, courseId)))
      .limit(1);

    if (!result) {
      throw new ApiException(
        'Lesson not found in this course',
        HttpStatus.NOT_FOUND,
        'LESSON_NOT_FOUND'
      );
    }

    // 2. Check authorization
    let enrollment: typeof enrollments.$inferSelect | null = null;
    if (
      user.role === 'admin' ||
      (user.role === 'instructor' && result.course.instructorId === user.id)
    ) {
      // Allowed through administrative or author role
    } else {
      enrollment = await this.verifyStudentEnrollment(courseId, user.id);
    }

    // 3. If learner has enrollment, record first access & update progress row lazily
    let currentProgress: typeof lessonProgress.$inferSelect | null = null;
    if (enrollment) {
      const now = new Date();

      if (!enrollment.startedAt) {
        await this.db
          .update(enrollments)
          .set({
            startedAt: now,
            lastAccessedAt: now,
            updatedAt: now,
          })
          .where(eq(enrollments.id, enrollment.id));
      } else {
        await this.db
          .update(enrollments)
          .set({
            lastAccessedAt: now,
            updatedAt: now,
          })
          .where(eq(enrollments.id, enrollment.id));
      }

      const [existingProgress] = await this.db
        .select()
        .from(lessonProgress)
        .where(
          and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lessonId))
        )
        .limit(1);

      if (!existingProgress) {
        const [createdProgress] = await this.db
          .insert(lessonProgress)
          .values({
            enrollmentId: enrollment.id,
            lessonId,
            status: 'IN_PROGRESS',
            watchPositionSeconds: 0,
            lastAccessedAt: now,
          })
          .returning();
        currentProgress = createdProgress;
      } else {
        const [updatedProgress] = await this.db
          .update(lessonProgress)
          .set({
            lastAccessedAt: now,
            updatedAt: now,
          })
          .where(eq(lessonProgress.id, existingProgress.id))
          .returning();
        currentProgress = updatedProgress;
      }
    }

    // 4. Resolve navigation links
    const allCourseLessons = await this.db
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId))
      .orderBy(modules.position, lessons.position);

    const currentIndex = allCourseLessons.findIndex((l) => l.id === lessonId);
    const previousLessonId = currentIndex > 0 ? allCourseLessons[currentIndex - 1].id : null;
    const nextLessonId =
      currentIndex >= 0 && currentIndex < allCourseLessons.length - 1
        ? allCourseLessons[currentIndex + 1].id
        : null;

    const progress = currentProgress
      ? {
          status: currentProgress.status,
          watchPositionSeconds: currentProgress.watchPositionSeconds,
          completedAt: currentProgress.completedAt
            ? currentProgress.completedAt.toISOString()
            : null,
        }
      : {
          status: 'NOT_STARTED' as const,
          watchPositionSeconds: 0,
          completedAt: null,
        };

    return {
      id: result.lesson.id,
      moduleId: result.lesson.moduleId,
      courseId,
      title: result.lesson.title,
      lessonType: result.lesson.lessonType,
      durationSeconds: result.lesson.durationSeconds,
      mediaUrl: result.mediaRecord?.publicUrl || null,
      content: result.lesson.content,
      progress,
      navigation: {
        previousLessonId,
        nextLessonId,
      },
    };
  }

  /**
   * GET /api/v1/learn/courses/:courseId/resume
   */
  async getResumePoint(courseId: string, user: UserContext) {
    const enrollment = await this.verifyStudentEnrollment(courseId, user.id);

    // Fetch all lessons in curricular sequence
    const courseLessons = await this.db
      .select({
        lesson: lessons,
        moduleId: modules.id,
        modulePosition: modules.position,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId))
      .orderBy(modules.position, lessons.position);

    if (courseLessons.length === 0) {
      return {
        lessonId: null,
        moduleId: null,
        lessonTitle: '',
        lessonType: 'VIDEO' as const,
        watchPositionSeconds: 0,
        progressPercentage: 0,
        isCourseCompleted: true,
      };
    }

    // Fetch progress records
    const progressRecords = await this.db
      .select()
      .from(lessonProgress)
      .where(eq(lessonProgress.enrollmentId, enrollment.id));

    const progressMap = new Map(progressRecords.map((p) => [p.lessonId, p]));
    const totalLessons = courseLessons.length;
    const completedLessons = progressRecords.filter((p) => p.status === 'COMPLETED').length;
    const progressPercentage = Math.round((completedLessons / totalLessons) * 100);
    const isCourseCompleted = completedLessons === totalLessons && totalLessons > 0;

    // Sync completion invariant
    if (enrollment.status === 'COMPLETED' && completedLessons < totalLessons) {
      await this.db
        .update(enrollments)
        .set({ status: 'ACTIVE', completedAt: null, updatedAt: new Date() })
        .where(eq(enrollments.id, enrollment.id));
    } else if (isCourseCompleted && enrollment.status !== 'COMPLETED') {
      await this.db
        .update(enrollments)
        .set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(enrollments.id, enrollment.id));
    }

    // 1. Most recently accessed IN_PROGRESS lesson
    const inProgress = progressRecords
      .filter((p) => p.status === 'IN_PROGRESS')
      .sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());

    let targetLesson = null;
    let targetWatchPos = 0;

    if (inProgress.length > 0) {
      const match = courseLessons.find((l) => l.lesson.id === inProgress[0].lessonId);
      if (match) {
        targetLesson = match;
        targetWatchPos = inProgress[0].watchPositionSeconds;
      }
    }

    // 2. First incomplete lesson in course sequence
    if (!targetLesson) {
      const firstIncomplete = courseLessons.find((l) => {
        const p = progressMap.get(l.lesson.id);
        return !p || p.status !== 'COMPLETED';
      });
      if (firstIncomplete) {
        targetLesson = firstIncomplete;
        const p = progressMap.get(firstIncomplete.lesson.id);
        targetWatchPos = p?.watchPositionSeconds || 0;
      }
    }

    // 3. If all completed, return first lesson
    if (!targetLesson) {
      targetLesson = courseLessons[0];
      const p = progressMap.get(targetLesson.lesson.id);
      targetWatchPos = p?.watchPositionSeconds || 0;
    }

    // Loop-back safety rule (ADR 0005 5.2 / AC-PROG-07):
    // If watchPositionSeconds >= 0.95 * durationSeconds, reset to 0
    if (
      targetLesson.lesson.lessonType === 'VIDEO' &&
      targetLesson.lesson.durationSeconds > 0 &&
      targetWatchPos >= Math.floor(0.95 * targetLesson.lesson.durationSeconds)
    ) {
      targetWatchPos = 0;
    }

    return {
      lessonId: targetLesson.lesson.id,
      moduleId: targetLesson.moduleId,
      lessonTitle: targetLesson.lesson.title,
      lessonType: targetLesson.lesson.lessonType,
      watchPositionSeconds: targetWatchPos,
      progressPercentage,
      isCourseCompleted,
    };
  }

  /**
   * POST /api/v1/learn/courses/:courseId/lessons/:lessonId/progress
   * Records playback checkpoint debounced every 15s. No audit log for normal heartbeats.
   */
  async saveProgressCheckpoint(
    courseId: string,
    lessonId: string,
    watchPositionSeconds: number,
    user: UserContext
  ) {
    const enrollment = await this.verifyStudentEnrollment(courseId, user.id);

    // Verify ancestry
    const [lessonResult] = await this.db
      .select({
        lesson: lessons,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(and(eq(lessons.id, lessonId), eq(modules.courseId, courseId)))
      .limit(1);

    if (!lessonResult) {
      throw new ApiException(
        'Lesson not found in this course',
        HttpStatus.NOT_FOUND,
        'LESSON_NOT_FOUND'
      );
    }

    const now = new Date();

    // Start enrollment if first interaction
    if (!enrollment.startedAt) {
      await this.db
        .update(enrollments)
        .set({
          startedAt: now,
          lastAccessedAt: now,
          updatedAt: now,
        })
        .where(eq(enrollments.id, enrollment.id));
    } else {
      await this.db
        .update(enrollments)
        .set({
          lastAccessedAt: now,
          updatedAt: now,
        })
        .where(eq(enrollments.id, enrollment.id));
    }

    const [existingProgress] = await this.db
      .select()
      .from(lessonProgress)
      .where(
        and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lessonId))
      )
      .limit(1);

    // Video 90% completion threshold (AC-PROG-04)
    const isVideoThreshold =
      lessonResult.lesson.lessonType === 'VIDEO' &&
      lessonResult.lesson.durationSeconds > 0 &&
      watchPositionSeconds >= Math.floor(0.9 * lessonResult.lesson.durationSeconds);

    const isCompleted = existingProgress?.status === 'COMPLETED' || isVideoThreshold;
    const targetStatus = isCompleted ? 'COMPLETED' : 'IN_PROGRESS';
    const completedAt = isCompleted ? existingProgress?.completedAt || now : null;

    const isNewlyCompleted =
      isCompleted && (!existingProgress || existingProgress.status !== 'COMPLETED');

    const [savedProgress] = await this.db
      .insert(lessonProgress)
      .values({
        enrollmentId: enrollment.id,
        lessonId,
        status: targetStatus,
        watchPositionSeconds,
        completedAt,
        lastAccessedAt: now,
      })
      .onConflictDoUpdate({
        target: [lessonProgress.enrollmentId, lessonProgress.lessonId],
        set: {
          watchPositionSeconds,
          status: targetStatus,
          completedAt,
          lastAccessedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    // Only audit when milestone is reached (no heartbeat spam)
    if (isNewlyCompleted) {
      await this.auditService.record({
        actorId: user.id,
        action: 'LESSON_COMPLETED',
        targetType: 'LESSON',
        targetId: lessonId,
        metadata: {
          courseId,
          enrollmentId: enrollment.id,
          completedAt,
          type: 'THRESHOLD',
        },
      });
    }

    // Calculate dynamic progress & course completion
    const { totalLessons, completedLessons, progressPercentage, isCourseCompleted } =
      await this.calculateProgress(courseId, enrollment.id);

    if (
      isCourseCompleted &&
      enrollment.status !== 'COMPLETED'
    ) {
      const [updatedEnrollment] = await this.db
        .update(enrollments)
        .set({
          status: 'COMPLETED',
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(enrollments.id, enrollment.id))
        .returning();

      await this.auditService.record({
        actorId: user.id,
        action: 'ENROLLMENT_COMPLETED',
        targetType: 'ENROLLMENT',
        targetId: enrollment.id,
        metadata: {
          studentId: user.id,
          courseId,
          completedAt: updatedEnrollment.completedAt,
          totalLessonsCount: totalLessons,
        },
      });

      await this.certificateService.issueCertificateIfEligible(enrollment.id, {
        actorId: user.id,
      });
    }

    return {
      lessonId,
      status: savedProgress.status,
      watchPositionSeconds: savedProgress.watchPositionSeconds,
      isCompleted: savedProgress.status === 'COMPLETED',
      courseProgressPercentage: progressPercentage,
    };
  }

  /**
   * POST /api/v1/learn/courses/:courseId/lessons/:lessonId/complete
   * Explicitly toggle lesson completion
   */
  async toggleLessonComplete(
    courseId: string,
    lessonId: string,
    completed: boolean,
    user: UserContext
  ) {
    const enrollment = await this.verifyStudentEnrollment(courseId, user.id);

    // Verify ancestry
    const [lessonResult] = await this.db
      .select({
        lesson: lessons,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(and(eq(lessons.id, lessonId), eq(modules.courseId, courseId)))
      .limit(1);

    if (!lessonResult) {
      throw new ApiException(
        'Lesson not found in this course',
        HttpStatus.NOT_FOUND,
        'LESSON_NOT_FOUND'
      );
    }

    const now = new Date();

    const [existingProgress] = await this.db
      .select()
      .from(lessonProgress)
      .where(
        and(eq(lessonProgress.enrollmentId, enrollment.id), eq(lessonProgress.lessonId, lessonId))
      )
      .limit(1);

    if (completed) {
      const wasAlreadyCompleted = existingProgress?.status === 'COMPLETED';
      const completedAt = existingProgress?.completedAt || now;

      const [savedProgress] = await this.db
        .insert(lessonProgress)
        .values({
          enrollmentId: enrollment.id,
          lessonId,
          status: 'COMPLETED',
          watchPositionSeconds: existingProgress?.watchPositionSeconds || 0,
          completedAt,
          lastAccessedAt: now,
        })
        .onConflictDoUpdate({
          target: [lessonProgress.enrollmentId, lessonProgress.lessonId],
          set: {
            status: 'COMPLETED',
            completedAt,
            lastAccessedAt: now,
            updatedAt: now,
          },
        })
        .returning();

      if (!wasAlreadyCompleted) {
        await this.auditService.record({
          actorId: user.id,
          action: 'LESSON_COMPLETED',
          targetType: 'LESSON',
          targetId: lessonId,
          metadata: {
            courseId,
            enrollmentId: enrollment.id,
            completedAt,
            type: 'MANUAL',
          },
        });
      }

      // Check course completion
      const { totalLessons, completedLessons, progressPercentage, isCourseCompleted } =
        await this.calculateProgress(courseId, enrollment.id);

      if (isCourseCompleted && enrollment.status !== 'COMPLETED') {
        const [updatedEnrollment] = await this.db
          .update(enrollments)
          .set({
            status: 'COMPLETED',
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(enrollments.id, enrollment.id))
          .returning();

        await this.auditService.record({
          actorId: user.id,
          action: 'ENROLLMENT_COMPLETED',
          targetType: 'ENROLLMENT',
          targetId: enrollment.id,
          metadata: {
            studentId: user.id,
            courseId,
            completedAt: updatedEnrollment.completedAt,
            totalLessonsCount: totalLessons,
          },
        });

        await this.certificateService.issueCertificateIfEligible(enrollment.id, {
          actorId: user.id,
        });
      }

      return {
        lessonId,
        status: savedProgress.status,
        completedAt: savedProgress.completedAt ? savedProgress.completedAt.toISOString() : null,
        courseProgress: {
          completedLessons,
          totalLessons,
          percentage: progressPercentage,
          isCourseCompleted,
        },
      };
    } else {
      // Revert to incomplete
      const wasCompleted = existingProgress?.status === 'COMPLETED';

      const [savedProgress] = await this.db
        .insert(lessonProgress)
        .values({
          enrollmentId: enrollment.id,
          lessonId,
          status: 'IN_PROGRESS',
          watchPositionSeconds: existingProgress?.watchPositionSeconds || 0,
          completedAt: null,
          lastAccessedAt: now,
        })
        .onConflictDoUpdate({
          target: [lessonProgress.enrollmentId, lessonProgress.lessonId],
          set: {
            status: 'IN_PROGRESS',
            completedAt: null,
            lastAccessedAt: now,
            updatedAt: now,
          },
        })
        .returning();

      if (wasCompleted) {
        await this.auditService.record({
          actorId: user.id,
          action: 'LESSON_UNCOMPLETED',
          targetType: 'LESSON',
          targetId: lessonId,
          metadata: {
            courseId,
            enrollmentId: enrollment.id,
          },
        });

        // Course completion reversal
        if (enrollment.status === 'COMPLETED') {
          await this.db
            .update(enrollments)
            .set({
              status: 'ACTIVE',
              completedAt: null,
              updatedAt: now,
            })
            .where(eq(enrollments.id, enrollment.id));
        }
      }

      const { totalLessons, completedLessons, progressPercentage } = await this.calculateProgress(
        courseId,
        enrollment.id
      );

      return {
        lessonId,
        status: savedProgress.status,
        completedAt: null,
        courseProgress: {
          completedLessons,
          totalLessons,
          percentage: progressPercentage,
          isCourseCompleted: false,
        },
      };
    }
  }
}
