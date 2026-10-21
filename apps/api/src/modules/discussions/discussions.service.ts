import { Injectable, HttpStatus, Inject } from '@nestjs/common';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  courses,
  lessons,
  modules,
  enrollments,
  users,
  userRoles,
  roles,
  discussions,
  discussionReplies,
  discussionVotes,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../../common/errors/api-error';
import { validateAndSanitizeContent } from '../../common/utils/content-sanitizer';
import type {
  CreateDiscussionDto,
  UpdateDiscussionDto,
  CreateDiscussionReplyDto,
  UpdateDiscussionReplyDto,
  DiscussionListQuery,
  DiscussionDto,
  DiscussionReplyDto,
  PaginatedDiscussionsDto,
} from '@techsprout/contracts';

@Injectable()
export class DiscussionsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /**
   * Helper: verify course and lesson exist, lesson belongs to course, and user has access.
   * Returns course, lesson, and user access status.
   */
  async verifyLessonAccess(courseId: string, lessonId: string, userId: string) {
    // 1. Fetch course
    const [course] = await this.db
      .select({ id: courses.id, instructorId: courses.instructorId, status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new ApiException('Course not found', HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND');
    }

    // 2. Fetch lesson and check module -> course relationship
    const [les] = await this.db
      .select({ id: lessons.id, moduleId: lessons.moduleId, courseId: modules.courseId })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(and(eq(lessons.id, lessonId), eq(modules.courseId, courseId)))
      .limit(1);

    if (!les) {
      throw new ApiException(
        'Lesson not found in this course',
        HttpStatus.NOT_FOUND,
        'LESSON_NOT_FOUND'
      );
    }

    // 3. Check User and Role
    const [userRecord] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRecord) {
      throw new ApiException('User not found', HttpStatus.UNAUTHORIZED, 'USER_NOT_FOUND');
    }

    const role = userRecord.role || 'student';
    const isAdmin = role === 'admin';
    const isCourseInstructor = course.instructorId === userId;

    if (isAdmin || isCourseInstructor) {
      return { course, lesson: les, user: { ...userRecord, role }, isCourseInstructor, isAdmin };
    }

    // 4. Verify enrollment for students
    const [enrollment] = await this.db
      .select({ id: enrollments.id, status: enrollments.status })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, userId),
          eq(enrollments.courseId, courseId),
          sql`${enrollments.status} IN ('ACTIVE', 'COMPLETED')`
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new ApiException(
        'ENROLLMENT_REQUIRED: Access denied: You must be enrolled in this course to view or participate in discussions',
        HttpStatus.FORBIDDEN,
        'ENROLLMENT_REQUIRED'
      );
    }

    return { course, lesson: les, user: { ...userRecord, role }, isCourseInstructor: false, isAdmin: false };
  }

  /**
   * Create a new discussion thread on a lesson
   */
  async createDiscussion(
    courseId: string,
    lessonId: string,
    userId: string,
    dto: CreateDiscussionDto
  ): Promise<DiscussionDto> {
    const { isCourseInstructor, isAdmin, user } = await this.verifyLessonAccess(
      courseId,
      lessonId,
      userId
    );

    const title = validateAndSanitizeContent(dto.title, 'title');
    const content = validateAndSanitizeContent(dto.content, 'content');

    const [created] = await this.db
      .insert(discussions)
      .values({
        courseId,
        lessonId,
        userId,
        title,
        content,
        status: 'ACTIVE',
        upvoteCount: 0,
        replyCount: 0,
        isPinned: false,
      })
      .returning();

    return {
      id: created.id,
      courseId: created.courseId,
      lessonId: created.lessonId,
      userId: created.userId,
      userName: user.name,
      userAvatar: null,
      isCourseInstructor,
      isAdmin,
      title: created.title,
      content: created.content,
      status: created.status,
      upvoteCount: created.upvoteCount,
      replyCount: created.replyCount,
      isPinned: created.isPinned,
      hasUpvoted: false,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * List discussion threads on a lesson with sorting, pagination, and instructor badges
   */
  async listDiscussions(
    courseId: string,
    lessonId: string,
    userId: string,
    query: DiscussionListQuery
  ): Promise<PaginatedDiscussionsDto> {
    const { isCourseInstructor, isAdmin } = await this.verifyLessonAccess(
      courseId,
      lessonId,
      userId
    );

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [
      eq(discussions.courseId, courseId),
      eq(discussions.lessonId, lessonId),
    ];

    // Regular students cannot see HIDDEN or DELETED unless it's their own
    if (!isAdmin && !isCourseInstructor) {
      if (query.status) {
        if (query.status === 'HIDDEN' || query.status === 'DELETED') {
          conditions.push(
            and(eq(discussions.status, query.status), eq(discussions.userId, userId))!
          );
        } else {
          conditions.push(eq(discussions.status, query.status));
        }
      } else {
        conditions.push(
          sql`(${discussions.status} IN ('ACTIVE', 'RESOLVED') OR ${discussions.userId} = ${userId})`
        );
      }
    } else if (query.status) {
      conditions.push(eq(discussions.status, query.status));
    }

    if (query.sort === 'unanswered') {
      conditions.push(eq(discussions.replyCount, 0));
    }

    const whereClause = and(...conditions);

    // Count total
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(discussions)
      .where(whereClause);

    const total = countResult?.count || 0;

    // Sorting
    const orderByList = [desc(discussions.isPinned)];
    if (query.sort === 'upvoted') {
      orderByList.push(desc(discussions.upvoteCount));
    }
    orderByList.push(desc(discussions.createdAt));

    const rows = await this.db
      .select({
        discussion: discussions,
        author: {
          id: users.id,
          name: users.name,
          role: roles.name,
        },
        courseInstructorId: courses.instructorId,
      })
      .from(discussions)
      .innerJoin(users, eq(discussions.userId, users.id))
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(courses, eq(discussions.courseId, courses.id))
      .where(whereClause)
      .orderBy(...orderByList)
      .limit(limit)
      .offset(offset);

    // Fetch user votes for these discussions
    const discussionIds = rows.map((r) => r.discussion.id);
    let userVotedIds = new Set<string>();

    if (discussionIds.length > 0) {
      const votes = await this.db
        .select({ targetId: discussionVotes.targetId })
        .from(discussionVotes)
        .where(
          and(
            eq(discussionVotes.userId, userId),
            eq(discussionVotes.targetType, 'DISCUSSION'),
            inArray(discussionVotes.targetId, discussionIds)
          )
        );
      userVotedIds = new Set(votes.map((v) => v.targetId));
    }

    const data: DiscussionDto[] = rows.map((r) => ({
      id: r.discussion.id,
      courseId: r.discussion.courseId,
      lessonId: r.discussion.lessonId,
      userId: r.discussion.userId,
      userName: r.author.name,
      userAvatar: null,
      isCourseInstructor: r.courseInstructorId === r.author.id,
      isAdmin: r.author.role === 'admin',
      title: r.discussion.title,
      content: r.discussion.content,
      status: r.discussion.status,
      upvoteCount: r.discussion.upvoteCount,
      replyCount: r.discussion.replyCount,
      isPinned: r.discussion.isPinned,
      hasUpvoted: userVotedIds.has(r.discussion.id),
      createdAt: r.discussion.createdAt.toISOString(),
      updatedAt: r.discussion.updatedAt.toISOString(),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single discussion with its threaded replies
   */
  async getDiscussion(
    courseId: string,
    lessonId: string,
    discussionId: string,
    userId: string
  ): Promise<DiscussionDto & { replies: DiscussionReplyDto[] }> {
    const { isCourseInstructor, isAdmin } = await this.verifyLessonAccess(
      courseId,
      lessonId,
      userId
    );

    const [row] = await this.db
      .select({
        discussion: discussions,
        author: {
          id: users.id,
          name: users.name,
          role: roles.name,
        },
        courseInstructorId: courses.instructorId,
      })
      .from(discussions)
      .innerJoin(users, eq(discussions.userId, users.id))
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(courses, eq(discussions.courseId, courses.id))
      .where(
        and(
          eq(discussions.id, discussionId),
          eq(discussions.courseId, courseId),
          eq(discussions.lessonId, lessonId)
        )
      )
      .limit(1);

    if (!row) {
      throw new ApiException('Discussion not found', HttpStatus.NOT_FOUND, 'DISCUSSION_NOT_FOUND');
    }

    // Check if current user voted on discussion
    const [vote] = await this.db
      .select({ id: discussionVotes.id })
      .from(discussionVotes)
      .where(
        and(
          eq(discussionVotes.userId, userId),
          eq(discussionVotes.targetType, 'DISCUSSION'),
          eq(discussionVotes.targetId, discussionId)
        )
      )
      .limit(1);

    // Fetch replies
    const replyConditions = [eq(discussionReplies.discussionId, discussionId)];
    if (!isAdmin && !isCourseInstructor) {
      replyConditions.push(
        sql`(${discussionReplies.status} = 'ACTIVE' OR ${discussionReplies.userId} = ${userId})`
      );
    }

    const rawReplies = await this.db
      .select({
        reply: discussionReplies,
        author: {
          id: users.id,
          name: users.name,
          role: roles.name,
        },
        courseInstructorId: courses.instructorId,
      })
      .from(discussionReplies)
      .innerJoin(users, eq(discussionReplies.userId, users.id))
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(discussions, eq(discussionReplies.discussionId, discussions.id))
      .innerJoin(courses, eq(discussions.courseId, courses.id))
      .where(and(...replyConditions))
      .orderBy(discussionReplies.createdAt);

    // Fetch user votes for replies
    const replyIds = rawReplies.map((r) => r.reply.id);
    let userVotedReplyIds = new Set<string>();

    if (replyIds.length > 0) {
      const replyVotes = await this.db
        .select({ targetId: discussionVotes.targetId })
        .from(discussionVotes)
        .where(
          and(
            eq(discussionVotes.userId, userId),
            eq(discussionVotes.targetType, 'REPLY'),
            inArray(discussionVotes.targetId, replyIds)
          )
        );
      userVotedReplyIds = new Set(replyVotes.map((v) => v.targetId));
    }

    // Structure flat replies into hierarchical tree
    const replyDtoMap = new Map<string, DiscussionReplyDto>();
    const topLevelReplies: DiscussionReplyDto[] = [];

    for (const r of rawReplies) {
      const dto: DiscussionReplyDto = {
        id: r.reply.id,
        discussionId: r.reply.discussionId,
        userId: r.reply.userId,
        userName: r.author.name,
        userAvatar: null,
        isCourseInstructor: r.courseInstructorId === r.author.id,
        isAdmin: r.author.role === 'admin',
        parentReplyId: r.reply.parentReplyId,
        content: r.reply.content,
        status: r.reply.status,
        upvoteCount: r.reply.upvoteCount,
        hasUpvoted: userVotedReplyIds.has(r.reply.id),
        createdAt: r.reply.createdAt.toISOString(),
        updatedAt: r.reply.updatedAt.toISOString(),
        replies: [],
      };
      replyDtoMap.set(dto.id, dto);
    }

    for (const dto of replyDtoMap.values()) {
      if (dto.parentReplyId && replyDtoMap.has(dto.parentReplyId)) {
        replyDtoMap.get(dto.parentReplyId)!.replies!.push(dto);
      } else {
        topLevelReplies.push(dto);
      }
    }

    return {
      id: row.discussion.id,
      courseId: row.discussion.courseId,
      lessonId: row.discussion.lessonId,
      userId: row.discussion.userId,
      userName: row.author.name,
      userAvatar: null,
      isCourseInstructor: row.courseInstructorId === row.author.id,
      isAdmin: row.author.role === 'admin',
      title: row.discussion.title,
      content: row.discussion.content,
      status: row.discussion.status,
      upvoteCount: row.discussion.upvoteCount,
      replyCount: row.discussion.replyCount,
      isPinned: row.discussion.isPinned,
      hasUpvoted: Boolean(vote),
      createdAt: row.discussion.createdAt.toISOString(),
      updatedAt: row.discussion.updatedAt.toISOString(),
      replies: topLevelReplies,
    };
  }

  /**
   * Update discussion (author can update title/content; instructor/admin can moderate status/pin)
   */
  async updateDiscussion(
    courseId: string,
    lessonId: string,
    discussionId: string,
    userId: string,
    dto: UpdateDiscussionDto
  ): Promise<DiscussionDto> {
    const { isCourseInstructor, isAdmin } = await this.verifyLessonAccess(
      courseId,
      lessonId,
      userId
    );

    const [existing] = await this.db
      .select()
      .from(discussions)
      .where(
        and(
          eq(discussions.id, discussionId),
          eq(discussions.courseId, courseId),
          eq(discussions.lessonId, lessonId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new ApiException('Discussion not found', HttpStatus.NOT_FOUND, 'DISCUSSION_NOT_FOUND');
    }

    const isAuthor = existing.userId === userId;
    const canModerate = isCourseInstructor || isAdmin;

    if (dto.isPinned !== undefined && !canModerate) {
      throw new ApiException('Only course instructors or admins can pin discussions', HttpStatus.FORBIDDEN, 'FORBIDDEN');
    }

    if (!isAuthor && !canModerate) {
      throw new ApiException(
        'Access denied: You cannot edit another user discussion',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    const updates: Partial<typeof discussions.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.title !== undefined) {
      if (!isAuthor) {
        throw new ApiException('Only the author can modify the title', HttpStatus.FORBIDDEN, 'FORBIDDEN');
      }
      updates.title = validateAndSanitizeContent(dto.title, 'title');
    }

    if (dto.content !== undefined) {
      if (!isAuthor) {
        throw new ApiException('Only the author can modify the content', HttpStatus.FORBIDDEN, 'FORBIDDEN');
      }
      updates.content = validateAndSanitizeContent(dto.content, 'content');
    }

    if (dto.status !== undefined) {
      if (!canModerate && !isAuthor) {
        throw new ApiException('Cannot alter status without moderation authority', HttpStatus.FORBIDDEN, 'FORBIDDEN');
      }
      if (isAuthor && !canModerate && (dto.status === 'HIDDEN' || dto.status === 'DELETED')) {
        throw new ApiException('Authors cannot hide discussions; delete instead', HttpStatus.FORBIDDEN, 'FORBIDDEN');
      }
      updates.status = dto.status;

      if (canModerate) {
        await this.auditService.record({
          actorId: userId,
          action: 'DISCUSSION_MODERATED',
          targetType: 'DISCUSSION',
          targetId: discussionId,
          metadata: { newStatus: dto.status, previousStatus: existing.status },
        });
      }
    }

    if (dto.isPinned !== undefined) {
      if (!canModerate) {
        throw new ApiException('Only course instructors or admins can pin discussions', HttpStatus.FORBIDDEN, 'FORBIDDEN');
      }
      updates.isPinned = dto.isPinned;

      await this.auditService.record({
        actorId: userId,
        action: dto.isPinned ? 'DISCUSSION_PINNED' : 'DISCUSSION_UNPINNED',
        targetType: 'DISCUSSION',
        targetId: discussionId,
      });
    }

    const [updated] = await this.db
      .update(discussions)
      .set(updates)
      .where(eq(discussions.id, discussionId))
      .returning();

    const [authorRecord] = await this.db
      .select({ id: users.id, name: users.name, role: roles.name })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(users.id, updated.userId))
      .limit(1);

    return {
      id: updated.id,
      courseId: updated.courseId,
      lessonId: updated.lessonId,
      userId: updated.userId,
      userName: authorRecord?.name || 'Unknown',
      userAvatar: null,
      isCourseInstructor: authorRecord ? authorRecord.id === userId && isCourseInstructor : false,
      isAdmin: authorRecord?.role === 'admin',
      title: updated.title,
      content: updated.content,
      status: updated.status,
      upvoteCount: updated.upvoteCount,
      replyCount: updated.replyCount,
      isPinned: updated.isPinned,
      hasUpvoted: false,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Delete discussion
   */
  async deleteDiscussion(
    courseId: string,
    lessonId: string,
    discussionId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    const { isCourseInstructor, isAdmin } = await this.verifyLessonAccess(
      courseId,
      lessonId,
      userId
    );

    const [existing] = await this.db
      .select()
      .from(discussions)
      .where(
        and(
          eq(discussions.id, discussionId),
          eq(discussions.courseId, courseId),
          eq(discussions.lessonId, lessonId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new ApiException('Discussion not found', HttpStatus.NOT_FOUND, 'DISCUSSION_NOT_FOUND');
    }

    const isAuthor = existing.userId === userId;
    const canModerate = isCourseInstructor || isAdmin;

    if (!isAuthor && !canModerate) {
      throw new ApiException(
        'Access denied: You do not have permission to delete this discussion',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    await this.db
      .update(discussions)
      .set({ status: 'DELETED', updatedAt: new Date() })
      .where(eq(discussions.id, discussionId));

    await this.auditService.record({
      actorId: userId,
      action: 'DISCUSSION_DELETED',
      targetType: 'DISCUSSION',
      targetId: discussionId,
      metadata: { deletedByAuthor: isAuthor },
    });

    return { success: true, message: 'Discussion successfully deleted' };
  }

  /**
   * Create reply to a discussion thread
   */
  async createReply(
    courseId: string,
    lessonId: string,
    discussionId: string,
    userId: string,
    dto: CreateDiscussionReplyDto
  ): Promise<DiscussionReplyDto> {
    const { isCourseInstructor, isAdmin, user } = await this.verifyLessonAccess(
      courseId,
      lessonId,
      userId
    );

    const [discussion] = await this.db
      .select()
      .from(discussions)
      .where(
        and(
          eq(discussions.id, discussionId),
          eq(discussions.courseId, courseId),
          eq(discussions.lessonId, lessonId)
        )
      )
      .limit(1);

    if (!discussion || discussion.status === 'DELETED') {
      throw new ApiException('Discussion not found or deleted', HttpStatus.NOT_FOUND, 'DISCUSSION_NOT_FOUND');
    }

    if (dto.parentReplyId) {
      const [parent] = await this.db
        .select()
        .from(discussionReplies)
        .where(
          and(
            eq(discussionReplies.id, dto.parentReplyId),
            eq(discussionReplies.discussionId, discussionId)
          )
        )
        .limit(1);

      if (!parent || parent.status === 'DELETED') {
        throw new ApiException(
          'INVALID_PARENT_REPLY: Parent reply not found in this discussion thread',
          HttpStatus.BAD_REQUEST,
          'INVALID_PARENT_REPLY'
        );
      }
    }

    const content = validateAndSanitizeContent(dto.content, 'content');

    const created = await this.db.transaction(async (tx) => {
      const [reply] = await tx
        .insert(discussionReplies)
        .values({
          discussionId,
          userId,
          parentReplyId: dto.parentReplyId || null,
          content,
          status: 'ACTIVE',
          upvoteCount: 0,
        })
        .returning();

      await tx
        .update(discussions)
        .set({
          replyCount: sql`${discussions.replyCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(discussions.id, discussionId));

      return reply;
    });

    return {
      id: created.id,
      discussionId: created.discussionId,
      userId: created.userId,
      userName: user.name,
      userAvatar: null,
      isCourseInstructor,
      isAdmin,
      parentReplyId: created.parentReplyId,
      content: created.content,
      status: created.status,
      upvoteCount: created.upvoteCount,
      hasUpvoted: false,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      replies: [],
    };
  }

  /**
   * Update reply (author can edit content; instructor/admin can moderate status)
   */
  async updateReply(
    courseId: string,
    lessonId: string,
    discussionId: string,
    replyId: string,
    userId: string,
    dto: UpdateDiscussionReplyDto
  ): Promise<DiscussionReplyDto> {
    const { isCourseInstructor, isAdmin } = await this.verifyLessonAccess(
      courseId,
      lessonId,
      userId
    );

    const [existing] = await this.db
      .select({
        reply: discussionReplies,
        author: {
          id: users.id,
          name: users.name,
          role: roles.name,
        },
      })
      .from(discussionReplies)
      .innerJoin(users, eq(discussionReplies.userId, users.id))
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(discussionReplies.id, replyId),
          eq(discussionReplies.discussionId, discussionId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new ApiException('Reply not found', HttpStatus.NOT_FOUND, 'REPLY_NOT_FOUND');
    }

    const isAuthor = existing.reply.userId === userId;
    const canModerate = isCourseInstructor || isAdmin;

    if (!isAuthor && !canModerate) {
      throw new ApiException(
        'Access denied: You cannot edit another user reply',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    const updates: Partial<typeof discussionReplies.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.content !== undefined) {
      if (!isAuthor) {
        throw new ApiException('Only author can edit reply text', HttpStatus.FORBIDDEN, 'FORBIDDEN');
      }
      updates.content = validateAndSanitizeContent(dto.content, 'content');
    }

    if (dto.status !== undefined) {
      if (!canModerate) {
        throw new ApiException('Only instructors or admins can moderate reply status', HttpStatus.FORBIDDEN, 'FORBIDDEN');
      }
      updates.status = dto.status;
      await this.auditService.record({
        actorId: userId,
        action: 'DISCUSSION_REPLY_MODERATED',
        targetType: 'DISCUSSION_REPLY',
        targetId: replyId,
        metadata: { newStatus: dto.status },
      });
    }

    const [updated] = await this.db
      .update(discussionReplies)
      .set(updates)
      .where(eq(discussionReplies.id, replyId))
      .returning();

    return {
      id: updated.id,
      discussionId: updated.discussionId,
      userId: updated.userId,
      userName: existing.author.name,
      userAvatar: null,
      isCourseInstructor: existing.author.id === userId && isCourseInstructor,
      isAdmin: existing.author.role === 'admin',
      parentReplyId: updated.parentReplyId,
      content: updated.content,
      status: updated.status,
      upvoteCount: updated.upvoteCount,
      hasUpvoted: false,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      replies: [],
    };
  }

  /**
   * Delete reply
   */
  async deleteReply(
    courseId: string,
    lessonId: string,
    discussionId: string,
    replyId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    const { isCourseInstructor, isAdmin } = await this.verifyLessonAccess(
      courseId,
      lessonId,
      userId
    );

    const [existing] = await this.db
      .select()
      .from(discussionReplies)
      .where(
        and(
          eq(discussionReplies.id, replyId),
          eq(discussionReplies.discussionId, discussionId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new ApiException('Reply not found', HttpStatus.NOT_FOUND, 'REPLY_NOT_FOUND');
    }

    const isAuthor = existing.userId === userId;
    const canModerate = isCourseInstructor || isAdmin;

    if (!isAuthor && !canModerate) {
      throw new ApiException(
        'Access denied: You cannot delete this reply',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(discussionReplies)
        .set({ status: 'DELETED', updatedAt: new Date() })
        .where(eq(discussionReplies.id, replyId));

      await tx
        .update(discussions)
        .set({
          replyCount: sql`GREATEST(0, ${discussions.replyCount} - 1)`,
          updatedAt: new Date(),
        })
        .where(eq(discussions.id, discussionId));
    });

    return { success: true, message: 'Reply deleted successfully' };
  }

  /**
   * Toggle upvote on a discussion (1 vote per user)
   */
  async toggleDiscussionVote(
    courseId: string,
    lessonId: string,
    discussionId: string,
    userId: string
  ): Promise<{ upvoted: boolean; upvoteCount: number }> {
    await this.verifyLessonAccess(courseId, lessonId, userId);

    const [discussion] = await this.db
      .select()
      .from(discussions)
      .where(
        and(
          eq(discussions.id, discussionId),
          eq(discussions.courseId, courseId),
          eq(discussions.lessonId, lessonId)
        )
      )
      .limit(1);

    if (!discussion || discussion.status === 'DELETED') {
      throw new ApiException('Discussion not found', HttpStatus.NOT_FOUND, 'DISCUSSION_NOT_FOUND');
    }

    return await this.db.transaction(async (tx) => {
      const [existingVote] = await tx
        .select()
        .from(discussionVotes)
        .where(
          and(
            eq(discussionVotes.userId, userId),
            eq(discussionVotes.targetType, 'DISCUSSION'),
            eq(discussionVotes.targetId, discussionId)
          )
        )
        .limit(1);

      if (existingVote) {
        // Remove vote
        await tx.delete(discussionVotes).where(eq(discussionVotes.id, existingVote.id));
        const [updated] = await tx
          .update(discussions)
          .set({
            upvoteCount: sql`GREATEST(0, ${discussions.upvoteCount} - 1)`,
          })
          .where(eq(discussions.id, discussionId))
          .returning({ upvoteCount: discussions.upvoteCount });

        return { upvoted: false, upvoteCount: updated.upvoteCount };
      } else {
        // Add vote
        await tx.insert(discussionVotes).values({
          userId,
          targetType: 'DISCUSSION',
          targetId: discussionId,
        });
        const [updated] = await tx
          .update(discussions)
          .set({
            upvoteCount: sql`${discussions.upvoteCount} + 1`,
          })
          .where(eq(discussions.id, discussionId))
          .returning({ upvoteCount: discussions.upvoteCount });

        return { upvoted: true, upvoteCount: updated.upvoteCount };
      }
    });
  }

  /**
   * Toggle upvote on a reply (1 vote per user)
   */
  async toggleReplyVote(
    courseId: string,
    lessonId: string,
    discussionId: string,
    replyId: string,
    userId: string
  ): Promise<{ upvoted: boolean; upvoteCount: number }> {
    await this.verifyLessonAccess(courseId, lessonId, userId);

    const [reply] = await this.db
      .select()
      .from(discussionReplies)
      .where(
        and(
          eq(discussionReplies.id, replyId),
          eq(discussionReplies.discussionId, discussionId)
        )
      )
      .limit(1);

    if (!reply || reply.status === 'DELETED') {
      throw new ApiException('Reply not found', HttpStatus.NOT_FOUND, 'REPLY_NOT_FOUND');
    }

    return await this.db.transaction(async (tx) => {
      const [existingVote] = await tx
        .select()
        .from(discussionVotes)
        .where(
          and(
            eq(discussionVotes.userId, userId),
            eq(discussionVotes.targetType, 'REPLY'),
            eq(discussionVotes.targetId, replyId)
          )
        )
        .limit(1);

      if (existingVote) {
        await tx.delete(discussionVotes).where(eq(discussionVotes.id, existingVote.id));
        const [updated] = await tx
          .update(discussionReplies)
          .set({
            upvoteCount: sql`GREATEST(0, ${discussionReplies.upvoteCount} - 1)`,
          })
          .where(eq(discussionReplies.id, replyId))
          .returning({ upvoteCount: discussionReplies.upvoteCount });

        return { upvoted: false, upvoteCount: updated.upvoteCount };
      } else {
        await tx.insert(discussionVotes).values({
          userId,
          targetType: 'REPLY',
          targetId: replyId,
        });
        const [updated] = await tx
          .update(discussionReplies)
          .set({
            upvoteCount: sql`${discussionReplies.upvoteCount} + 1`,
          })
          .where(eq(discussionReplies.id, replyId))
          .returning({ upvoteCount: discussionReplies.upvoteCount });

        return { upvoted: true, upvoteCount: updated.upvoteCount };
      }
    });
  }
}
