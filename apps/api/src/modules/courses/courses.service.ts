import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, sql, ilike, or, gte, lte, asc, desc, not } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  courses,
  categories,
  users,
  media,
  modules,
  lessons,
  Course,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { QueryCoursesDto, AdminQueryCoursesDto } from './dto/query-courses.dto';
import { slugify } from '../../common/utils/slug.util';

export interface UserContext {
  id: string;
  role: string;
}

@Injectable()
export class CoursesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /**
   * Verify server-side course ownership.
   * Admin can access all courses; Instructor can only access their own.
   */
  async verifyCourseOwnership(courseId: string, user: UserContext): Promise<Course> {
    const [course] = await this.db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new ApiException(
        `Course with ID "${courseId}" not found`,
        HttpStatus.NOT_FOUND,
        'COURSE_NOT_FOUND'
      );
    }

    if (user.role === 'instructor' && course.instructorId !== user.id) {
      throw new ApiException(
        'Access denied: you do not have permission to manage this course',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return course;
  }

  async create(
    dto: CreateCourseDto,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Course> {
    // 1. Resolve instructor ownership
    const instructorId = user.role === 'admin' ? dto.instructorId || user.id : user.id;

    // 2. Validate category exists
    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, dto.categoryId))
      .limit(1);

    if (!category) {
      throw new ApiException(
        `Category with ID "${dto.categoryId}" not found`,
        HttpStatus.NOT_FOUND,
        'CATEGORY_NOT_FOUND'
      );
    }

    // 3. Validate instructor exists
    const [instructor] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, instructorId))
      .limit(1);

    if (!instructor) {
      throw new ApiException(
        `Instructor with ID "${instructorId}" not found`,
        HttpStatus.NOT_FOUND,
        'INSTRUCTOR_NOT_FOUND'
      );
    }

    // 4. Validate thumbnail media if provided
    if (dto.thumbnailMediaId) {
      const [mediaRecord] = await this.db
        .select()
        .from(media)
        .where(eq(media.id, dto.thumbnailMediaId))
        .limit(1);

      if (!mediaRecord) {
        throw new ApiException(
          `Thumbnail media with ID "${dto.thumbnailMediaId}" not found`,
          HttpStatus.NOT_FOUND,
          'MEDIA_NOT_FOUND'
        );
      }
    }

    // 5. Generate and check slug
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.title);
    const [existingSlug] = await this.db
      .select()
      .from(courses)
      .where(eq(courses.slug, slug))
      .limit(1);

    if (existingSlug) {
      throw new ApiException(
        `Course with slug "${slug}" already exists`,
        HttpStatus.CONFLICT,
        'COURSE_SLUG_EXISTS'
      );
    }

    // 6. Create course record with DRAFT status
    const [created] = await this.db
      .insert(courses)
      .values({
        categoryId: dto.categoryId,
        instructorId,
        title: dto.title,
        slug,
        shortDescription: dto.shortDescription || null,
        description: dto.description || null,
        status: 'DRAFT',
        visibility: dto.visibility || 'PUBLIC',
        price: dto.price || '0.00',
        currency: dto.currency || 'USD',
        level: dto.level || 'BEGINNER',
        language: dto.language || 'English',
        durationMinutes: dto.durationMinutes || 0,
        thumbnailMediaId: dto.thumbnailMediaId || null,
      })
      .returning();

    // 7. Audit creation
    await this.auditService.record({
      actorId: user.id,
      action: 'COURSE_CREATED',
      targetType: 'COURSE',
      targetId: created.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        title: created.title,
        slug: created.slug,
        categoryId: created.categoryId,
        instructorId: created.instructorId,
      },
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateCourseDto,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Course> {
    const existing = await this.verifyCourseOwnership(id, user);

    const updatedFields: string[] = [];
    const updates: Partial<typeof courses.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.title !== undefined && dto.title !== existing.title) {
      updates.title = dto.title;
      updatedFields.push('title');
    }

    if (dto.slug !== undefined) {
      const normalizedSlug = slugify(dto.slug);
      if (normalizedSlug !== existing.slug) {
        const [slugConflict] = await this.db
          .select()
          .from(courses)
          .where(and(eq(courses.slug, normalizedSlug), not(eq(courses.id, id))))
          .limit(1);

        if (slugConflict) {
          throw new ApiException(
            `Course with slug "${normalizedSlug}" already exists`,
            HttpStatus.CONFLICT,
            'COURSE_SLUG_EXISTS'
          );
        }
        updates.slug = normalizedSlug;
        updatedFields.push('slug');
      }
    }

    if (dto.shortDescription !== undefined && dto.shortDescription !== existing.shortDescription) {
      updates.shortDescription = dto.shortDescription;
      updatedFields.push('shortDescription');
    }

    if (dto.description !== undefined && dto.description !== existing.description) {
      updates.description = dto.description;
      updatedFields.push('description');
    }

    if (dto.categoryId !== undefined && dto.categoryId !== existing.categoryId) {
      const [category] = await this.db
        .select()
        .from(categories)
        .where(eq(categories.id, dto.categoryId))
        .limit(1);

      if (!category) {
        throw new ApiException(
          `Category with ID "${dto.categoryId}" not found`,
          HttpStatus.NOT_FOUND,
          'CATEGORY_NOT_FOUND'
        );
      }
      updates.categoryId = dto.categoryId;
      updatedFields.push('categoryId');
    }

    if (dto.instructorId !== undefined && dto.instructorId !== existing.instructorId) {
      if (user.role !== 'admin') {
        throw new ApiException(
          'Only administrators can reassign course instructors',
          HttpStatus.FORBIDDEN,
          'FORBIDDEN'
        );
      }
      const [instructor] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, dto.instructorId))
        .limit(1);

      if (!instructor) {
        throw new ApiException(
          `Instructor with ID "${dto.instructorId}" not found`,
          HttpStatus.NOT_FOUND,
          'INSTRUCTOR_NOT_FOUND'
        );
      }
      updates.instructorId = dto.instructorId;
      updatedFields.push('instructorId');
    }

    if (dto.price !== undefined && dto.price !== existing.price) {
      updates.price = dto.price;
      updatedFields.push('price');
    }

    if (dto.currency !== undefined && dto.currency !== existing.currency) {
      updates.currency = dto.currency;
      updatedFields.push('currency');
    }

    if (dto.level !== undefined && dto.level !== existing.level) {
      updates.level = dto.level;
      updatedFields.push('level');
    }

    if (dto.language !== undefined && dto.language !== existing.language) {
      updates.language = dto.language;
      updatedFields.push('language');
    }

    if (dto.durationMinutes !== undefined && dto.durationMinutes !== existing.durationMinutes) {
      updates.durationMinutes = dto.durationMinutes;
      updatedFields.push('durationMinutes');
    }

    if (dto.visibility !== undefined && dto.visibility !== existing.visibility) {
      updates.visibility = dto.visibility;
      updatedFields.push('visibility');
    }

    if (dto.thumbnailMediaId !== undefined && dto.thumbnailMediaId !== existing.thumbnailMediaId) {
      if (dto.thumbnailMediaId !== null) {
        const [mediaRecord] = await this.db
          .select()
          .from(media)
          .where(eq(media.id, dto.thumbnailMediaId))
          .limit(1);

        if (!mediaRecord) {
          throw new ApiException(
            `Thumbnail media with ID "${dto.thumbnailMediaId}" not found`,
            HttpStatus.NOT_FOUND,
            'MEDIA_NOT_FOUND'
          );
        }
      }
      updates.thumbnailMediaId = dto.thumbnailMediaId;
      updatedFields.push('thumbnailMediaId');
    }

    if (updatedFields.length === 0) {
      return existing;
    }

    const [updated] = await this.db
      .update(courses)
      .set(updates)
      .where(eq(courses.id, id))
      .returning();

    await this.auditService.record({
      actorId: user.id,
      action: 'COURSE_UPDATED',
      targetType: 'COURSE',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
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
    const existing = await this.verifyCourseOwnership(id, user);

    if (existing.status !== 'DRAFT') {
      throw new ApiException(
        'Only draft courses may be deleted. Published or archived courses cannot be hard-deleted.',
        HttpStatus.BAD_REQUEST,
        'CANNOT_DELETE_NON_DRAFT'
      );
    }

    await this.db.delete(courses).where(eq(courses.id, id));

    await this.auditService.record({
      actorId: user.id,
      action: 'COURSE_DELETED',
      targetType: 'COURSE',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        title: existing.title,
        slug: existing.slug,
        instructorId: existing.instructorId,
      },
    });

    return { deleted: true, id };
  }

  // --- COURSE STATE MACHINE (ADMIN ONLY) ---

  async publish(
    id: string,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Course> {
    const [course] = await this.db
      .select()
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);

    if (!course) {
      throw new ApiException(
        `Course with ID "${id}" not found`,
        HttpStatus.NOT_FOUND,
        'COURSE_NOT_FOUND'
      );
    }

    if (course.status !== 'DRAFT') {
      throw new ApiException(
        `Cannot publish a course with status "${course.status}". Allowed transition: DRAFT -> PUBLISHED.`,
        HttpStatus.BAD_REQUEST,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Validation Invariants:
    // 1. Course must contain at least 1 module
    const courseModules = await this.db
      .select()
      .from(modules)
      .where(eq(modules.courseId, id))
      .orderBy(modules.position);

    if (courseModules.length === 0) {
      throw new ApiException(
        'Course must contain at least one module before publishing',
        HttpStatus.BAD_REQUEST,
        'COURSE_PUBLISH_VALIDATION_FAILED'
      );
    }

    let totalLessonsCount = 0;

    // 2. Each module must contain at least 1 lesson
    for (const mod of courseModules) {
      const moduleLessons = await this.db
        .select()
        .from(lessons)
        .where(eq(lessons.moduleId, mod.id))
        .orderBy(lessons.position);

      if (moduleLessons.length === 0) {
        throw new ApiException(
          `Module "${mod.title}" must contain at least one lesson before publishing`,
          HttpStatus.BAD_REQUEST,
          'COURSE_PUBLISH_VALIDATION_FAILED'
        );
      }

      // 3. All video lessons must have an attached mediaId
      for (const les of moduleLessons) {
        if (les.lessonType === 'VIDEO' && !les.mediaId) {
          throw new ApiException(
            `Video lesson "${les.title}" in module "${mod.title}" must have a valid media attachment before publishing`,
            HttpStatus.BAD_REQUEST,
            'COURSE_PUBLISH_VALIDATION_FAILED'
          );
        }
      }

      totalLessonsCount += moduleLessons.length;
    }

    const now = new Date();
    const [published] = await this.db
      .update(courses)
      .set({
        status: 'PUBLISHED',
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(courses.id, id))
      .returning();

    await this.auditService.record({
      actorId: user.id,
      action: 'COURSE_PUBLISHED',
      targetType: 'COURSE',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        publishedAt: now.toISOString(),
        modulesCount: courseModules.length,
        lessonsCount: totalLessonsCount,
      },
    });

    return published;
  }

  async unpublish(
    id: string,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Course> {
    const [course] = await this.db
      .select()
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);

    if (!course) {
      throw new ApiException(
        `Course with ID "${id}" not found`,
        HttpStatus.NOT_FOUND,
        'COURSE_NOT_FOUND'
      );
    }

    if (course.status !== 'PUBLISHED') {
      throw new ApiException(
        `Cannot unpublish a course with status "${course.status}". Allowed transition: PUBLISHED -> DRAFT.`,
        HttpStatus.BAD_REQUEST,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const [unpublished] = await this.db
      .update(courses)
      .set({
        status: 'DRAFT',
        updatedAt: new Date(),
      })
      .where(eq(courses.id, id))
      .returning();

    await this.auditService.record({
      actorId: user.id,
      action: 'COURSE_UNPUBLISHED',
      targetType: 'COURSE',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        previousStatus: 'PUBLISHED',
      },
    });

    return unpublished;
  }

  async archive(
    id: string,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Course> {
    const [course] = await this.db
      .select()
      .from(courses)
      .where(eq(courses.id, id))
      .limit(1);

    if (!course) {
      throw new ApiException(
        `Course with ID "${id}" not found`,
        HttpStatus.NOT_FOUND,
        'COURSE_NOT_FOUND'
      );
    }

    if (course.status !== 'PUBLISHED') {
      throw new ApiException(
        `Cannot archive a course with status "${course.status}". Allowed transition: PUBLISHED -> ARCHIVED.`,
        HttpStatus.BAD_REQUEST,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const now = new Date();
    const [archived] = await this.db
      .update(courses)
      .set({
        status: 'ARCHIVED',
        updatedAt: now,
      })
      .where(eq(courses.id, id))
      .returning();

    await this.auditService.record({
      actorId: user.id,
      action: 'COURSE_ARCHIVED',
      targetType: 'COURSE',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        archivedAt: now.toISOString(),
      },
    });

    return archived;
  }

  // --- QUERY & RETRIEVAL ---

  async findAdminCourses(query: AdminQueryCoursesDto, user: UserContext) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 12, 100);
    const offset = (page - 1) * limit;

    // Conditions
    const conditions = [];

    // Scope for instructor
    if (user.role === 'instructor') {
      conditions.push(eq(courses.instructorId, user.id));
    } else if (query.instructorId) {
      conditions.push(eq(courses.instructorId, query.instructorId));
    }

    if (query.status) {
      conditions.push(eq(courses.status, query.status));
    }

    if (query.visibility) {
      conditions.push(eq(courses.visibility, query.visibility));
    }

    if (query.categoryId) {
      conditions.push(eq(courses.categoryId, query.categoryId));
    }

    if (query.level) {
      conditions.push(eq(courses.level, query.level));
    }

    if (query.language) {
      conditions.push(eq(courses.language, query.language));
    }

    if (query.minPrice !== undefined) {
      conditions.push(gte(courses.price, query.minPrice.toString()));
    }

    if (query.maxPrice !== undefined) {
      conditions.push(lte(courses.price, query.maxPrice.toString()));
    }

    if (query.search) {
      const term = `%${query.search}%`;
      const searchCond = or(ilike(courses.title, term), ilike(courses.shortDescription, term));
      if (searchCond) {
        conditions.push(searchCond);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Sorting
    const sortOrder = query.sortOrder === 'asc' ? asc : desc;
    let orderClause = desc(courses.createdAt);
    if (query.sortBy === 'price') {
      orderClause = sortOrder(courses.price);
    } else if (query.sortBy === 'title') {
      orderClause = sortOrder(courses.title);
    } else {
      orderClause = sortOrder(courses.createdAt);
    }

    // Count
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(courses)
      .where(whereClause);

    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Items
    const items = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        shortDescription: courses.shortDescription,
        status: courses.status,
        visibility: courses.visibility,
        price: courses.price,
        currency: courses.currency,
        level: courses.level,
        language: courses.language,
        durationMinutes: courses.durationMinutes,
        thumbnailMediaId: courses.thumbnailMediaId,
        thumbnailUrl: media.publicUrl,
        category: {
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
        },
        instructor: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
        publishedAt: courses.publishedAt,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
      })
      .from(courses)
      .innerJoin(categories, eq(courses.categoryId, categories.id))
      .innerJoin(users, eq(courses.instructorId, users.id))
      .leftJoin(media, eq(courses.thumbnailMediaId, media.id))
      .where(whereClause)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset);

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

  async findAdminCourseById(id: string, user: UserContext) {
    const course = await this.verifyCourseOwnership(id, user);

    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, course.categoryId))
      .limit(1);

    const [instructor] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        username: users.username,
      })
      .from(users)
      .where(eq(users.id, course.instructorId))
      .limit(1);

    let thumbnailUrl: string | null = null;
    if (course.thumbnailMediaId) {
      const [mediaRecord] = await this.db
        .select()
        .from(media)
        .where(eq(media.id, course.thumbnailMediaId))
        .limit(1);
      thumbnailUrl = mediaRecord?.publicUrl || null;
    }

    const courseModules = await this.db
      .select()
      .from(modules)
      .where(eq(modules.courseId, id))
      .orderBy(modules.position);

    const modulesWithLessons = [];
    for (const mod of courseModules) {
      const moduleLessons = await this.db
        .select({
          id: lessons.id,
          moduleId: lessons.moduleId,
          title: lessons.title,
          description: lessons.description,
          lessonType: lessons.lessonType,
          position: lessons.position,
          durationSeconds: lessons.durationSeconds,
          isPreview: lessons.isPreview,
          mediaId: lessons.mediaId,
          content: lessons.content,
          createdAt: lessons.createdAt,
          updatedAt: lessons.updatedAt,
        })
        .from(lessons)
        .where(eq(lessons.moduleId, mod.id))
        .orderBy(lessons.position);

      modulesWithLessons.push({
        ...mod,
        lessons: moduleLessons,
      });
    }

    return {
      ...course,
      thumbnailUrl,
      category,
      instructor,
      modules: modulesWithLessons,
    };
  }

  async findPublicCourses(query: QueryCoursesDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 12, 100);
    const offset = (page - 1) * limit;

    // Base conditions: strictly PUBLISHED and PUBLIC
    const conditions = [
      eq(courses.status, 'PUBLISHED'),
      eq(courses.visibility, 'PUBLIC'),
      eq(categories.isActive, true),
    ];

    if (query.categoryId) {
      conditions.push(eq(courses.categoryId, query.categoryId));
    }

    if (query.categorySlug) {
      conditions.push(eq(categories.slug, query.categorySlug));
    }

    if (query.level) {
      conditions.push(eq(courses.level, query.level));
    }

    if (query.language) {
      conditions.push(eq(courses.language, query.language));
    }

    if (query.minPrice !== undefined) {
      conditions.push(gte(courses.price, query.minPrice.toString()));
    }

    if (query.maxPrice !== undefined) {
      conditions.push(lte(courses.price, query.maxPrice.toString()));
    }

    if (query.search) {
      const term = `%${query.search}%`;
      const searchCond = or(ilike(courses.title, term), ilike(courses.shortDescription, term));
      if (searchCond) {
        conditions.push(searchCond);
      }
    }

    const whereClause = and(...conditions);

    // Sorting
    const sortOrder = query.sortOrder === 'asc' ? asc : desc;
    let orderClause = desc(courses.createdAt);
    if (query.sortBy === 'price') {
      orderClause = sortOrder(courses.price);
    } else if (query.sortBy === 'title') {
      orderClause = sortOrder(courses.title);
    } else {
      orderClause = sortOrder(courses.createdAt);
    }

    // Count
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(courses)
      .innerJoin(categories, eq(courses.categoryId, categories.id))
      .where(whereClause);

    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Items
    const rawItems = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        shortDescription: courses.shortDescription,
        price: courses.price,
        currency: courses.currency,
        level: courses.level,
        language: courses.language,
        durationMinutes: courses.durationMinutes,
        thumbnailUrl: media.publicUrl,
        category: {
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
        },
        instructor: {
          id: users.id,
          name: users.name,
        },
        publishedAt: courses.publishedAt,
      })
      .from(courses)
      .innerJoin(categories, eq(courses.categoryId, categories.id))
      .innerJoin(users, eq(courses.instructorId, users.id))
      .leftJoin(media, eq(courses.thumbnailMediaId, media.id))
      .where(whereClause)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset);

    // Attach modulesCount and lessonsCount
    const items = await Promise.all(
      rawItems.map(async (item) => {
        const [moduleStats] = await this.db
          .select({
            modulesCount: sql<number>`count(distinct ${modules.id})::int`,
            lessonsCount: sql<number>`count(${lessons.id})::int`,
          })
          .from(modules)
          .leftJoin(lessons, eq(modules.id, lessons.moduleId))
          .where(eq(modules.courseId, item.id));

        return {
          ...item,
          modulesCount: moduleStats?.modulesCount || 0,
          lessonsCount: moduleLessonsCountSafe(moduleStats?.lessonsCount),
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

  async findPublicCourseBySlug(slug: string) {
    const [course] = await this.db
      .select({
        id: courses.id,
        title: courses.title,
        slug: courses.slug,
        shortDescription: courses.shortDescription,
        description: courses.description,
        price: courses.price,
        currency: courses.currency,
        level: courses.level,
        language: courses.language,
        durationMinutes: courses.durationMinutes,
        thumbnailUrl: media.publicUrl,
        publishedAt: courses.publishedAt,
        category: {
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
        },
        instructor: {
          id: users.id,
          name: users.name,
        },
      })
      .from(courses)
      .innerJoin(categories, eq(courses.categoryId, categories.id))
      .innerJoin(users, eq(courses.instructorId, users.id))
      .leftJoin(media, eq(courses.thumbnailMediaId, media.id))
      .where(
        and(
          eq(courses.slug, slug),
          eq(courses.status, 'PUBLISHED'),
          eq(courses.visibility, 'PUBLIC'),
          eq(categories.isActive, true)
        )
      )
      .limit(1);

    if (!course) {
      throw new ApiException(
        `Course with slug "${slug}" not found`,
        HttpStatus.NOT_FOUND,
        'COURSE_NOT_FOUND'
      );
    }

    // Load modules
    const courseModules = await this.db
      .select({
        id: modules.id,
        title: modules.title,
        position: modules.position,
      })
      .from(modules)
      .where(eq(modules.courseId, course.id))
      .orderBy(modules.position);

    // Load lessons with public preview media rule:
    // Only if is_preview = true, expose mediaUrl. Otherwise mediaUrl = null.
    const modulesWithLessons = await Promise.all(
      courseModules.map(async (mod) => {
        const rawLessons = await this.db
          .select({
            id: lessons.id,
            title: lessons.title,
            position: lessons.position,
            lessonType: lessons.lessonType,
            durationSeconds: lessons.durationSeconds,
            isPreview: lessons.isPreview,
            mediaUrl: media.publicUrl,
          })
          .from(lessons)
          .leftJoin(media, eq(lessons.mediaId, media.id))
          .where(eq(lessons.moduleId, mod.id))
          .orderBy(lessons.position);

        const sanitizedLessons = rawLessons.map((les) => ({
          id: les.id,
          title: les.title,
          position: les.position,
          lessonType: les.lessonType,
          durationSeconds: les.durationSeconds,
          isPreview: les.isPreview,
          mediaUrl: les.isPreview ? les.mediaUrl : null,
        }));

        return {
          id: mod.id,
          title: mod.title,
          position: mod.position,
          lessons: sanitizedLessons,
        };
      })
    );

    return {
      ...course,
      modules: modulesWithLessons,
    };
  }
}

function moduleLessonsCountSafe(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseInt(val, 10) || 0;
  return 0;
}
