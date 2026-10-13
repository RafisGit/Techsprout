import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, not } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import { modules, courses, Module as CourseModule } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { CoursesService, UserContext } from '../courses/courses.service';
import { ApiException } from '../../common/errors/api-error';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';

@Injectable()
export class ModulesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(CoursesService) private readonly coursesService: CoursesService
  ) {}

  /**
   * Resolve module and verify ownership of its ancestor course.
   */
  async resolveModuleOwnership(
    moduleId: string,
    user: UserContext
  ): Promise<{ module: CourseModule; courseInstructorId: string; courseStatus: string }> {
    const [result] = await this.db
      .select({
        module: modules,
        courseInstructorId: courses.instructorId,
        courseStatus: courses.status,
      })
      .from(modules)
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(modules.id, moduleId))
      .limit(1);

    if (!result) {
      throw new ApiException(
        `Module with ID "${moduleId}" not found`,
        HttpStatus.NOT_FOUND,
        'MODULE_NOT_FOUND'
      );
    }

    if (user.role === 'instructor' && result.courseInstructorId !== user.id) {
      throw new ApiException(
        'Access denied: you do not own the course containing this module',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return result;
  }

  async create(
    courseId: string,
    dto: CreateModuleDto,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<CourseModule> {
    // 1. Verify caller owns the course (or is admin) and course is not locked
    const course = await this.coursesService.verifyCourseOwnership(courseId, user);
    if (course.status === 'IN_REVIEW') {
      throw new ApiException(
        'Course is under review and cannot be modified',
        HttpStatus.BAD_REQUEST,
        'COURSE_LOCKED_FOR_REVIEW'
      );
    }

    // 2. Check position uniqueness within this course
    const [existingPosition] = await this.db
      .select()
      .from(modules)
      .where(and(eq(modules.courseId, courseId), eq(modules.position, dto.position)))
      .limit(1);

    if (existingPosition) {
      throw new ApiException(
        `Module position ${dto.position} is already taken in this course`,
        HttpStatus.CONFLICT,
        'MODULE_POSITION_EXISTS'
      );
    }

    // 3. Insert module
    const [created] = await this.db
      .insert(modules)
      .values({
        courseId,
        title: dto.title,
        description: dto.description || null,
        position: dto.position,
      })
      .returning();

    // 4. Audit
    await this.auditService.record({
      actorId: user.id,
      action: 'MODULE_CREATED',
      targetType: 'MODULE',
      targetId: created.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        courseId,
        title: created.title,
        position: created.position,
      },
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateModuleDto,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<CourseModule> {
    const { module: existing, courseStatus } = await this.resolveModuleOwnership(id, user);

    if (courseStatus === 'IN_REVIEW') {
      throw new ApiException(
        'Course is under review and cannot be modified',
        HttpStatus.BAD_REQUEST,
        'COURSE_LOCKED_FOR_REVIEW'
      );
    }

    const updatedFields: string[] = [];
    const updates: Partial<typeof modules.$inferInsert> = {
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

    if (dto.position !== undefined && dto.position !== existing.position) {
      const [positionConflict] = await this.db
        .select()
        .from(modules)
        .where(
          and(
            eq(modules.courseId, existing.courseId),
            eq(modules.position, dto.position),
            not(eq(modules.id, id))
          )
        )
        .limit(1);

      if (positionConflict) {
        throw new ApiException(
          `Module position ${dto.position} is already taken in this course`,
          HttpStatus.CONFLICT,
          'MODULE_POSITION_EXISTS'
        );
      }
      updates.position = dto.position;
      updatedFields.push('position');
    }

    if (updatedFields.length === 0) {
      return existing;
    }

    const [updated] = await this.db
      .update(modules)
      .set(updates)
      .where(eq(modules.id, id))
      .returning();

    await this.auditService.record({
      actorId: user.id,
      action: 'MODULE_UPDATED',
      targetType: 'MODULE',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        courseId: existing.courseId,
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
    const { module: existing, courseStatus } = await this.resolveModuleOwnership(id, user);

    if (courseStatus === 'IN_REVIEW') {
      throw new ApiException(
        'Course is under review and cannot be modified',
        HttpStatus.BAD_REQUEST,
        'COURSE_LOCKED_FOR_REVIEW'
      );
    }

    await this.db.delete(modules).where(eq(modules.id, id));

    await this.auditService.record({
      actorId: user.id,
      action: 'MODULE_DELETED',
      targetType: 'MODULE',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        courseId: existing.courseId,
        title: existing.title,
        position: existing.position,
      },
    });

    return { deleted: true, id };
  }
}
