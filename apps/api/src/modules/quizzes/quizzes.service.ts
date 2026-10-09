import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, not, sql, asc, inArray } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  quizzes,
  modules,
  courses,
  quizQuestions,
  quizQuestionOptions,
  quizAttempts,
  enrollments,
  Quiz,
  QuizQuestion,
  QuizQuestionOption,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { ModulesService } from '../modules/modules.service';
import { StudentQuizzesService } from './student-quizzes.service';
import { UserContext } from '../courses/courses.service';
import { ApiException } from '../../common/errors/api-error';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { ReorderDto } from './dto/reorder.dto';
import { validateQuizForPublish } from './quizzes.validator';

@Injectable()
export class QuizzesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(ModulesService) private readonly modulesService: ModulesService,
    @Inject(StudentQuizzesService) private readonly studentQuizzesService: StudentQuizzesService
  ) {}

  /**
   * Resolve quiz ownership chain: quiz -> module -> course -> course.instructorId
   */
  async resolveQuizOwnership(
    quizId: string,
    user: UserContext
  ): Promise<{
    quiz: Quiz;
    module: { id: string; title: string; courseId: string };
    course: { id: string; title: string; instructorId: string; status: string };
  }> {
    const [result] = await this.db
      .select({
        quiz: quizzes,
        module: {
          id: modules.id,
          title: modules.title,
          courseId: modules.courseId,
        },
        course: {
          id: courses.id,
          title: courses.title,
          instructorId: courses.instructorId,
          status: courses.status,
        },
      })
      .from(quizzes)
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!result) {
      throw new ApiException(
        `Quiz with ID "${quizId}" not found`,
        HttpStatus.NOT_FOUND,
        'QUIZ_NOT_FOUND'
      );
    }

    if (user.role === 'instructor' && result.course.instructorId !== user.id) {
      throw new ApiException(
        'Access denied: you do not own the course containing this quiz',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return result;
  }

  async create(
    moduleId: string,
    dto: CreateQuizDto,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Quiz> {
    // 1. Verify module ownership and check course lock
    const { module: modRecord, courseStatus } = await this.modulesService.resolveModuleOwnership(
      moduleId,
      user
    );

    if (courseStatus === 'IN_REVIEW') {
      throw new ApiException(
        'Course is under review and cannot be modified',
        HttpStatus.BAD_REQUEST,
        'COURSE_LOCKED_FOR_REVIEW'
      );
    }

    // 2. Enforce single FINAL_EXAM constraint per course
    if (dto.quizType === 'FINAL_EXAM') {
      const [existingFinal] = await this.db
        .select({ id: quizzes.id, title: quizzes.title })
        .from(quizzes)
        .innerJoin(modules, eq(quizzes.moduleId, modules.id))
        .where(
          and(
            eq(modules.courseId, modRecord.courseId),
            eq(quizzes.quizType, 'FINAL_EXAM')
          )
        )
        .limit(1);

      if (existingFinal) {
        throw new ApiException(
          `Course already has a final exam designated: "${existingFinal.title}"`,
          HttpStatus.CONFLICT,
          'FINAL_EXAM_CONFLICT'
        );
      }
    }

    // 3. Check position uniqueness within module
    const [posConflict] = await this.db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.moduleId, moduleId), eq(quizzes.position, dto.position)))
      .limit(1);

    if (posConflict) {
      throw new ApiException(
        `Quiz position ${dto.position} is already taken in this module`,
        HttpStatus.CONFLICT,
        'QUIZ_POSITION_EXISTS'
      );
    }

    // 4. Insert quiz with status DRAFT
    const [created] = await this.db
      .insert(quizzes)
      .values({
        moduleId,
        title: dto.title,
        description: dto.description || null,
        quizType: dto.quizType || 'KNOWLEDGE_CHECK',
        position: dto.position,
        passingScorePercentage: dto.passingScorePercentage || 70,
        maxAttempts: dto.maxAttempts !== undefined ? dto.maxAttempts : 3,
        timeLimitMinutes: dto.timeLimitMinutes || null,
        status: 'DRAFT',
      })
      .returning();

    // 5. Emit audit event
    await this.auditService.record({
      actorId: user.id,
      action: 'QUIZ_CREATED',
      targetType: 'QUIZ',
      targetId: created.id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        moduleId,
        title: created.title,
        quizType: created.quizType,
        position: created.position,
      },
    });

    return created;
  }

  async findById(quizId: string, user: UserContext) {
    const { quiz, module: mod, course } = await this.resolveQuizOwnership(quizId, user);

    // Fetch ordered questions
    const questionsList = await this.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.position));

    // Fetch ordered options
    const questionIds = questionsList.map((q) => q.id);
    let optionsList: QuizQuestionOption[] = [];
    if (questionIds.length > 0) {
      optionsList = await this.db
        .select()
        .from(quizQuestionOptions)
        .where(inArray(quizQuestionOptions.questionId, questionIds))
        .orderBy(asc(quizQuestionOptions.position));
    }

    const optionsByQuestion = new Map<string, QuizQuestionOption[]>();
    for (const opt of optionsList) {
      const arr = optionsByQuestion.get(opt.questionId) || [];
      arr.push(opt);
      optionsByQuestion.set(opt.questionId, arr);
    }

    const totalPoints = questionsList.reduce((acc, q) => acc + q.points, 0);

    return {
      ...quiz,
      module: mod,
      course,
      questionsCount: questionsList.length,
      totalPoints,
      questions: questionsList.map((q) => ({
        ...q,
        options: optionsByQuestion.get(q.id) || [],
      })),
    };
  }

  async listByModule(moduleId: string, user: UserContext) {
    await this.modulesService.resolveModuleOwnership(moduleId, user);

    const quizList = await this.db
      .select()
      .from(quizzes)
      .where(eq(quizzes.moduleId, moduleId))
      .orderBy(asc(quizzes.position));

    return quizList;
  }

  async update(
    id: string,
    dto: UpdateQuizDto,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Quiz> {
    const { quiz: existing, module: mod, course } = await this.resolveQuizOwnership(id, user);

    if (course.status === 'IN_REVIEW') {
      throw new ApiException(
        'Course is under review and cannot be modified',
        HttpStatus.BAD_REQUEST,
        'COURSE_LOCKED_FOR_REVIEW'
      );
    }

    if (existing.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot modify an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    // Check final exam conflict
    if (dto.quizType === 'FINAL_EXAM' && existing.quizType !== 'FINAL_EXAM') {
      const [existingFinal] = await this.db
        .select({ id: quizzes.id, title: quizzes.title })
        .from(quizzes)
        .innerJoin(modules, eq(quizzes.moduleId, modules.id))
        .where(
          and(
            eq(modules.courseId, mod.courseId),
            eq(quizzes.quizType, 'FINAL_EXAM'),
            not(eq(quizzes.id, id))
          )
        )
        .limit(1);

      if (existingFinal) {
        throw new ApiException(
          `Course already has a final exam designated: "${existingFinal.title}"`,
          HttpStatus.CONFLICT,
          'FINAL_EXAM_CONFLICT'
        );
      }
    }

    // Check position uniqueness
    if (dto.position !== undefined && dto.position !== existing.position) {
      const [posConflict] = await this.db
        .select()
        .from(quizzes)
        .where(
          and(
            eq(quizzes.moduleId, existing.moduleId),
            eq(quizzes.position, dto.position),
            not(eq(quizzes.id, id))
          )
        )
        .limit(1);

      if (posConflict) {
        throw new ApiException(
          `Quiz position ${dto.position} is already taken in this module`,
          HttpStatus.CONFLICT,
          'QUIZ_POSITION_EXISTS'
        );
      }
    }

    const updatedFields: string[] = [];
    const updates: Partial<typeof quizzes.$inferInsert> = {
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
    if (dto.quizType !== undefined && dto.quizType !== existing.quizType) {
      updates.quizType = dto.quizType;
      updatedFields.push('quizType');
    }
    if (dto.position !== undefined && dto.position !== existing.position) {
      updates.position = dto.position;
      updatedFields.push('position');
    }
    if (
      dto.passingScorePercentage !== undefined &&
      dto.passingScorePercentage !== existing.passingScorePercentage
    ) {
      updates.passingScorePercentage = dto.passingScorePercentage;
      updatedFields.push('passingScorePercentage');
    }
    if (dto.maxAttempts !== undefined && dto.maxAttempts !== existing.maxAttempts) {
      updates.maxAttempts = dto.maxAttempts;
      updatedFields.push('maxAttempts');
    }
    if (
      dto.timeLimitMinutes !== undefined &&
      dto.timeLimitMinutes !== existing.timeLimitMinutes
    ) {
      updates.timeLimitMinutes = dto.timeLimitMinutes;
      updatedFields.push('timeLimitMinutes');
    }

    if (updatedFields.length === 0) {
      return existing;
    }

    const [updated] = await this.db
      .update(quizzes)
      .set(updates)
      .where(eq(quizzes.id, id))
      .returning();

    await this.auditService.record({
      actorId: user.id,
      action: 'QUIZ_UPDATED',
      targetType: 'QUIZ',
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
    const { quiz: existing, course } = await this.resolveQuizOwnership(id, user);

    if (course.status === 'IN_REVIEW') {
      throw new ApiException(
        'Course is under review and cannot be modified',
        HttpStatus.BAD_REQUEST,
        'COURSE_LOCKED_FOR_REVIEW'
      );
    }

    // Guard: quiz cannot be deleted if any student attempts exist
    const [attemptCountRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, id));

    const attemptCount = Number(attemptCountRes?.count || 0);
    if (attemptCount > 0) {
      throw new ApiException(
        `Cannot delete quiz: ${attemptCount} student attempt(s) have been recorded. Archive the quiz to retire it without invalidating student academic records.`,
        HttpStatus.CONFLICT,
        'QUIZ_HAS_ATTEMPTS',
        { attemptCount }
      );
    }

    await this.db.delete(quizzes).where(eq(quizzes.id, id));

    await this.auditService.record({
      actorId: user.id,
      action: 'QUIZ_DELETED',
      targetType: 'QUIZ',
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

  async publish(
    id: string,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Quiz> {
    const { quiz: existing } = await this.resolveQuizOwnership(id, user);

    if (existing.status === 'PUBLISHED') {
      throw new ApiException(
        'Quiz is already published',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_PUBLISHED'
      );
    }

    if (existing.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot publish an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    // Load questions and options to validate publication readiness
    const questionsList = await this.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, id))
      .orderBy(asc(quizQuestions.position));

    const questionIds = questionsList.map((q) => q.id);
    let optionsList: QuizQuestionOption[] = [];
    if (questionIds.length > 0) {
      optionsList = await this.db
        .select()
        .from(quizQuestionOptions)
        .where(inArray(quizQuestionOptions.questionId, questionIds))
        .orderBy(asc(quizQuestionOptions.position));
    }

    const optionsByQuestion = new Map<string, QuizQuestionOption[]>();
    for (const opt of optionsList) {
      const arr = optionsByQuestion.get(opt.questionId) || [];
      arr.push(opt);
      optionsByQuestion.set(opt.questionId, arr);
    }

    const validationResult = validateQuizForPublish({
      id: existing.id,
      title: existing.title,
      questions: questionsList.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        position: q.position,
        points: q.points,
        explanation: q.explanation,
        options: (optionsByQuestion.get(q.id) || []).map((o) => ({
          optionText: o.optionText,
          position: o.position,
          isCorrect: o.isCorrect,
        })),
      })),
    });

    if (!validationResult.isValid) {
      throw new ApiException(
        `Quiz is invalid for publication: ${validationResult.errors.join('; ')}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'QUIZ_INVALID_FOR_PUBLISH',
        { errors: validationResult.errors }
      );
    }

    const [published] = await this.db
      .update(quizzes)
      .set({
        status: 'PUBLISHED',
        updatedAt: new Date(),
      })
      .where(eq(quizzes.id, id))
      .returning();

    // Curricular expansion invariant: if parent course has any COMPLETED enrollments,
    // publishing a new quiz reduces their progress below 100%, reverting status to ACTIVE
    // and resetting completedAt to null until student passes the new quiz.
    const [modRecord] = await this.db
      .select({ courseId: modules.courseId })
      .from(modules)
      .where(eq(modules.id, existing.moduleId))
      .limit(1);

    if (modRecord) {
      await this.db
        .update(enrollments)
        .set({
          status: 'ACTIVE',
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(enrollments.courseId, modRecord.courseId),
            eq(enrollments.status, 'COMPLETED')
          )
        );
    }

    await this.auditService.record({
      actorId: user.id,
      action: 'QUIZ_PUBLISHED',
      targetType: 'QUIZ',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        moduleId: existing.moduleId,
        questionsCount: questionsList.length,
      },
    });

    return published;
  }

  async archive(
    id: string,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<Quiz> {
    const { quiz: existing } = await this.resolveQuizOwnership(id, user);

    if (existing.status === 'ARCHIVED') {
      throw new ApiException(
        'Quiz is already archived',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    if (existing.status !== 'PUBLISHED') {
      throw new ApiException(
        'Only published quizzes can be archived',
        HttpStatus.BAD_REQUEST,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const wasPublished = existing.status === 'PUBLISHED';
    const [archived] = await this.db
      .update(quizzes)
      .set({
        status: 'ARCHIVED',
        updatedAt: new Date(),
      })
      .where(eq(quizzes.id, id))
      .returning();

    // If published quiz is archived and all remaining items are complete, active enrollments can complete
    if (wasPublished) {
      const [modRecord] = await this.db
        .select({ courseId: modules.courseId })
        .from(modules)
        .where(eq(modules.id, existing.moduleId))
        .limit(1);

      if (modRecord) {
        const activeEnrollments = await this.db
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.courseId, modRecord.courseId),
              eq(enrollments.status, 'ACTIVE')
            )
          );

        for (const enr of activeEnrollments) {
          await this.studentQuizzesService.recalculateProgressAndCompletion(
            modRecord.courseId,
            enr.id,
            enr.studentId
          );
        }
      }
    }

    await this.auditService.record({
      actorId: user.id,
      action: 'QUIZ_ARCHIVED',
      targetType: 'QUIZ',
      targetId: id,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        moduleId: existing.moduleId,
      },
    });

    return archived;
  }

  async reorder(
    moduleId: string,
    dto: ReorderDto,
    user: UserContext
  ): Promise<{ success: boolean; count: number }> {
    await this.modulesService.resolveModuleOwnership(moduleId, user);

    const ids = dto.items.map((i) => i.id);
    const existing = await this.db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(and(eq(quizzes.moduleId, moduleId), inArray(quizzes.id, ids)));

    if (existing.length !== ids.length) {
      throw new ApiException(
        'One or more quiz IDs do not belong to this module',
        HttpStatus.BAD_REQUEST,
        'INVALID_REORDER_ITEMS'
      );
    }

    // Two-phase update to avoid temporary uniqueness constraint collisions (quizzes_module_position_uq)
    // Step 1: Shift to safe offset positions (> 0 to satisfy position_positive check)
    for (let i = 0; i < dto.items.length; i++) {
      await this.db
        .update(quizzes)
        .set({ position: 100000 + i, updatedAt: new Date() })
        .where(eq(quizzes.id, dto.items[i].id));
    }

    // Step 2: Set final target positions
    for (const item of dto.items) {
      await this.db
        .update(quizzes)
        .set({ position: item.position, updatedAt: new Date() })
        .where(eq(quizzes.id, item.id));
    }

    return { success: true, count: dto.items.length };
  }
}
