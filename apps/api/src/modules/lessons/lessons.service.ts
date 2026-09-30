import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, not, sql } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  lessons,
  modules,
  courses,
  media,
  enrollments,
  lessonProgress,
  Lesson,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ModulesService } from '../modules/modules.service';
import { UserContext } from '../courses/courses.service';
import { ApiException } from '../../common/errors/api-error';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class LessonsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ModulesService) private readonly modulesService: ModulesService
  ) {}

  /**
   * Resolve lesson ownership: lesson -> module -> course -> course.instructorId
   */
  async resolveLessonOwnership(
    lessonId: string,
    user: UserContext
  ): Promise<{ lesson: Lesson; moduleId: string; courseId: string; courseInstructorId: string }> {
    const [result] = await this.db
      .select({
        lesson: lessons,
        moduleId: modules.id,
        courseId: courses.id,
        courseInstructorId: courses.instructorId,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(lessons.id, lessonId))
      .limit(1);

    if (!result) {
      throw new ApiException(
        `Lesson with ID "${lessonId}" not found`,
        HttpStatus.NOT_FOUND,
        'LESSON_NOT_FOUND'
      );
    }

    if (user.role === 'instructor' && result.courseInstructorId !== user.id) {
      throw new ApiException(
        'Access denied: you do not own the course containing this lesson',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return result;
  }

  async create(
    moduleId: string,
    dto: CreateLessonDto,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Lesson> {
    // 1. Verify caller owns ancestor module and course
    await this.modulesService.resolveModuleOwnership(moduleId, user);

    // 2. Validate media existence if mediaId provided
    if (dto.mediaId) {
      const [mediaRecord] = await this.db
        .select()
        .from(media)
        .where(eq(media.id, dto.mediaId))
        .limit(1);

      if (!mediaRecord) {
        throw new ApiException(
          `Media with ID "${dto.mediaId}" not found`,
          HttpStatus.NOT_FOUND,
          'MEDIA_NOT_FOUND'
        );
      }
    }

    // 3. Check position uniqueness within module
    const [existingPosition] = await this.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.moduleId, moduleId), eq(lessons.position, dto.position)))
      .limit(1);

    if (existingPosition) {
      throw new ApiException(
        `Lesson position ${dto.position} is already taken in this module`,
        HttpStatus.CONFLICT,
        'LESSON_POSITION_EXISTS'
      );
    }

    // 4. Insert lesson
    const [created] = await this.db
      .insert(lessons)
      .values({
        moduleId,
        title: dto.title,
        description: dto.description || null,
        lessonType: dto.lessonType || 'VIDEO',
        position: dto.position,
        durationSeconds: dto.durationSeconds || 0,
        isPreview: dto.isPreview !== undefined ? dto.isPreview : false,
        mediaId: dto.mediaId || null,
        content: dto.content || null,
      })
      .returning();

    // 5. Curricular expansion invariant: if parent course has any COMPLETED enrollments,
    // adding a new lesson reduces their progress below 100%, reverting status to ACTIVE
    // and resetting completedAt to null until student completes new lesson(s).
    const [mod] = await this.db
      .select({ courseId: modules.courseId })
      .from(modules)
      .where(eq(modules.id, moduleId))
      .limit(1);

    if (mod) {
      await this.db
        .update(enrollments)
        .set({
          status: 'ACTIVE',
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(enrollments.courseId, mod.courseId), eq(enrollments.status, 'COMPLETED')));
    }

    // 6. Audit
    await this.auditService.record({
      actorId: user.id,
      action: 'LESSON_CREATED',
      targetType: 'LESSON',
      targetId: created.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        moduleId,
        title: created.title,
        lessonType: created.lessonType,
        position: created.position,
      },
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateLessonDto,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Lesson> {
    const { lesson: existing } = await this.resolveLessonOwnership(id, user);

    const updatedFields: string[] = [];
    const updates: Partial<typeof lessons.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.title !== undefined && dto.title !== existing.title) {
      updates.title = dto.title;
      updatedFields.push('title');
    }

    if (dto.description !== undefined && dto.description !== existing.description) {
      updates.description = dto.description;
      updatedFields.push('description');
    }

    if (dto.lessonType !== undefined && dto.lessonType !== existing.lessonType) {
      updates.lessonType = dto.lessonType;
      updatedFields.push('lessonType');
    }

    if (dto.position !== undefined && dto.position !== existing.position) {
      const [positionConflict] = await this.db
        .select()
        .from(lessons)
        .where(
          and(
            eq(lessons.moduleId, existing.moduleId),
            eq(lessons.position, dto.position),
            not(eq(lessons.id, id))
          )
        )
        .limit(1);

      if (positionConflict) {
        throw new ApiException(
          `Lesson position ${dto.position} is already taken in this module`,
          HttpStatus.CONFLICT,
          'LESSON_POSITION_EXISTS'
        );
      }
      updates.position = dto.position;
      updatedFields.push('position');
    }

    if (dto.durationSeconds !== undefined && dto.durationSeconds !== existing.durationSeconds) {
      updates.durationSeconds = dto.durationSeconds;
      updatedFields.push('durationSeconds');
    }

    if (dto.isPreview !== undefined && dto.isPreview !== existing.isPreview) {
      updates.isPreview = dto.isPreview;
      updatedFields.push('isPreview');
    }

    if (dto.mediaId !== undefined && dto.mediaId !== existing.mediaId) {
      if (dto.mediaId !== null) {
        const [mediaRecord] = await this.db
          .select()
          .from(media)
          .where(eq(media.id, dto.mediaId))
          .limit(1);

        if (!mediaRecord) {
          throw new ApiException(
            `Media with ID "${dto.mediaId}" not found`,
            HttpStatus.NOT_FOUND,
            'MEDIA_NOT_FOUND'
          );
        }
      }
      updates.mediaId = dto.mediaId;
      updatedFields.push('mediaId');
    }

    if (dto.content !== undefined && dto.content !== existing.content) {
      updates.content = dto.content;
      updatedFields.push('content');
    }

    if (updatedFields.length === 0) {
      return existing;
    }

    const [updated] = await this.db
      .update(lessons)
      .set(updates)
      .where(eq(lessons.id, id))
      .returning();

    await this.auditService.record({
      actorId: user.id,
      action: 'LESSON_UPDATED',
      targetType: 'LESSON',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        moduleId: existing.moduleId,
        updatedFields,
      },
    });

    return updated;
  }

  async delete(
    id: string,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<{ deleted: true; id: string }> {
    const { lesson: existing } = await this.resolveLessonOwnership(id, user);

    // Pre-check: cannot delete lesson if students have recorded progress
    const [progressCountResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonProgress)
      .where(eq(lessonProgress.lessonId, id));

    const progressCount = Number(progressCountResult?.count || 0);
    if (progressCount > 0) {
      throw new ApiException(
        `Cannot delete lesson: ${progressCount} student(s) have recorded learning progress on this lesson. To retire this lesson without disrupting student history, remove it from the curriculum or mark it inactive.`,
        HttpStatus.CONFLICT,
        'LESSON_HAS_STUDENT_PROGRESS',
        { progressCount }
      );
    }

    await this.db.delete(lessons).where(eq(lessons.id, id));

    await this.auditService.record({
      actorId: user.id,
      action: 'LESSON_DELETED',
      targetType: 'LESSON',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        moduleId: existing.moduleId,
        title: existing.title,
        position: existing.position,
      },
    });

    return { deleted: true, id };
  }
}
