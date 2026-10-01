import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, not, sql, asc, inArray } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  quizzes,
  quizQuestions,
  quizQuestionOptions,
  quizAttempts,
  modules,
  courses,
  QuizQuestion,
  QuizQuestionOption,
  Quiz,
} from '../../database/schema';
import { UserContext } from '../courses/courses.service';
import { ApiException } from '../../common/errors/api-error';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ReorderDto } from './dto/reorder.dto';
import { validateQuestionOptions } from './quizzes.validator';
import { QuizzesService } from './quizzes.service';

@Injectable()
export class QuestionsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(QuizzesService) private readonly quizzesService: QuizzesService
  ) {}

  /**
   * Resolve question ownership chain: question -> quiz -> module -> course -> course.instructorId
   */
  async resolveQuestionOwnership(
    questionId: string,
    user: UserContext
  ): Promise<{
    question: QuizQuestion;
    quiz: Quiz;
    module: { id: string; title: string; courseId: string };
    course: { id: string; title: string; instructorId: string };
  }> {
    const [result] = await this.db
      .select({
        question: quizQuestions,
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
        },
      })
      .from(quizQuestions)
      .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(quizQuestions.id, questionId))
      .limit(1);

    if (!result) {
      throw new ApiException(
        `Question with ID "${questionId}" not found`,
        HttpStatus.NOT_FOUND,
        'QUESTION_NOT_FOUND'
      );
    }

    if (user.role === 'instructor' && result.course.instructorId !== user.id) {
      throw new ApiException(
        'Access denied: you do not own the course containing this question',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return result;
  }

  async create(quizId: string, dto: CreateQuestionDto, user: UserContext) {
    const { quiz } = await this.quizzesService.resolveQuizOwnership(quizId, user);

    if (quiz.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot add questions to an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    if (quiz.status === 'PUBLISHED') {
      const [attemptCountRes] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(quizAttempts)
        .where(eq(quizAttempts.quizId, quizId));

      if (Number(attemptCountRes?.count || 0) > 0) {
        throw new ApiException(
          'Cannot add questions to a published quiz that has recorded student attempts',
          HttpStatus.CONFLICT,
          'QUIZ_HAS_ATTEMPTS'
        );
      }
    }

    // Check position uniqueness in quiz
    const [posConflict] = await this.db
      .select()
      .from(quizQuestions)
      .where(
        and(eq(quizQuestions.quizId, quizId), eq(quizQuestions.position, dto.position))
      )
      .limit(1);

    if (posConflict) {
      throw new ApiException(
        `Question position ${dto.position} is already taken in this quiz`,
        HttpStatus.CONFLICT,
        'QUESTION_POSITION_EXISTS'
      );
    }

    // Validate options if provided or if quiz is published
    const questionType = dto.questionType || 'SINGLE_CHOICE';
    if (dto.options && dto.options.length > 0) {
      const validation = validateQuestionOptions(questionType, dto.options);
      if (!validation.isValid) {
        throw new ApiException(
          validation.error || 'Invalid options configuration for question type',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'QUESTION_INVALID'
        );
      }
    } else if (quiz.status === 'PUBLISHED') {
      throw new ApiException(
        'A question added to a published quiz must include complete and valid options',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'QUESTION_INVALID'
      );
    }

    const [createdQuestion] = await this.db
      .insert(quizQuestions)
      .values({
        quizId,
        questionText: dto.questionText,
        questionType,
        position: dto.position,
        points: dto.points !== undefined ? dto.points : 1,
        explanation: dto.explanation || null,
      })
      .returning();

    let createdOptions: QuizQuestionOption[] = [];
    if (dto.options && dto.options.length > 0) {
      createdOptions = await this.db
        .insert(quizQuestionOptions)
        .values(
          dto.options.map((opt) => ({
            questionId: createdQuestion.id,
            optionText: opt.optionText,
            position: opt.position,
            isCorrect: opt.isCorrect !== undefined ? opt.isCorrect : false,
          }))
        )
        .returning();
    }

    return {
      ...createdQuestion,
      options: createdOptions,
    };
  }

  async findById(questionId: string, user: UserContext) {
    const { question } = await this.resolveQuestionOwnership(questionId, user);

    const options = await this.db
      .select()
      .from(quizQuestionOptions)
      .where(eq(quizQuestionOptions.questionId, questionId))
      .orderBy(asc(quizQuestionOptions.position));

    return {
      ...question,
      options,
    };
  }

  async update(questionId: string, dto: UpdateQuestionDto, user: UserContext) {
    const { question: existing, quiz } = await this.resolveQuestionOwnership(
      questionId,
      user
    );

    if (quiz.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot modify questions of an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    // Check attempts on quiz
    const [attemptCountRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, quiz.id));

    const attemptCount = Number(attemptCountRes?.count || 0);
    if (attemptCount > 0) {
      if (
        (dto.questionType && dto.questionType !== existing.questionType) ||
        (dto.points !== undefined && dto.points !== existing.points) ||
        (dto.position !== undefined && dto.position !== existing.position)
      ) {
        throw new ApiException(
          'Cannot structurally alter a question for a quiz with recorded student attempts',
          HttpStatus.CONFLICT,
          'QUIZ_HAS_ATTEMPTS'
        );
      }
    }

    // Check position uniqueness
    if (dto.position !== undefined && dto.position !== existing.position) {
      const [posConflict] = await this.db
        .select()
        .from(quizQuestions)
        .where(
          and(
            eq(quizQuestions.quizId, existing.quizId),
            eq(quizQuestions.position, dto.position),
            not(eq(quizQuestions.id, questionId))
          )
        )
        .limit(1);

      if (posConflict) {
        throw new ApiException(
          `Question position ${dto.position} is already taken in this quiz`,
          HttpStatus.CONFLICT,
          'QUESTION_POSITION_EXISTS'
        );
      }
    }

    // Check if new question type is compatible with existing options
    if (dto.questionType !== undefined && dto.questionType !== existing.questionType) {
      const existingOptions = await this.db
        .select()
        .from(quizQuestionOptions)
        .where(eq(quizQuestionOptions.questionId, questionId));

      if (existingOptions.length > 0) {
        const validation = validateQuestionOptions(
          dto.questionType,
          existingOptions.map((o) => ({
            optionText: o.optionText,
            position: o.position,
            isCorrect: o.isCorrect,
          }))
        );

        if (!validation.isValid) {
          throw new ApiException(
            `Cannot change question type to ${dto.questionType}: ${validation.error}`,
            HttpStatus.UNPROCESSABLE_ENTITY,
            'QUESTION_INVALID'
          );
        }
      }
    }

    const updates: Partial<typeof quizQuestions.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.questionText !== undefined) updates.questionText = dto.questionText;
    if (dto.questionType !== undefined) updates.questionType = dto.questionType;
    if (dto.position !== undefined) updates.position = dto.position;
    if (dto.points !== undefined) updates.points = dto.points;
    if (dto.explanation !== undefined) updates.explanation = dto.explanation;

    const [updated] = await this.db
      .update(quizQuestions)
      .set(updates)
      .where(eq(quizQuestions.id, questionId))
      .returning();

    return updated;
  }

  async delete(
    questionId: string,
    user: UserContext
  ): Promise<{ deleted: true; id: string }> {
    const { quiz } = await this.resolveQuestionOwnership(questionId, user);

    if (quiz.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot delete questions from an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    // Guard: cannot delete if quiz has recorded attempts
    const [attemptCountRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, quiz.id));

    const attemptCount = Number(attemptCountRes?.count || 0);
    if (attemptCount > 0) {
      throw new ApiException(
        'Cannot delete question: student attempt(s) have been recorded for this quiz',
        HttpStatus.CONFLICT,
        'QUIZ_HAS_ATTEMPTS',
        { attemptCount }
      );
    }

    // Guard: cannot leave published quiz with 0 questions
    if (quiz.status === 'PUBLISHED') {
      const [qCountRes] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, quiz.id));

      if (Number(qCountRes?.count || 0) <= 1) {
        throw new ApiException(
          'Cannot delete the only question of a published quiz. Archive the quiz instead.',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'QUIZ_INVALID_FOR_PUBLISH'
        );
      }
    }

    await this.db.delete(quizQuestions).where(eq(quizQuestions.id, questionId));

    return { deleted: true, id: questionId };
  }

  async reorder(
    quizId: string,
    dto: ReorderDto,
    user: UserContext
  ): Promise<{ success: boolean; count: number }> {
    const { quiz } = await this.quizzesService.resolveQuizOwnership(quizId, user);

    if (quiz.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot reorder questions in an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    const ids = dto.items.map((i) => i.id);
    const existing = await this.db
      .select({ id: quizQuestions.id })
      .from(quizQuestions)
      .where(and(eq(quizQuestions.quizId, quizId), inArray(quizQuestions.id, ids)));

    if (existing.length !== ids.length) {
      throw new ApiException(
        'One or more question IDs do not belong to this quiz',
        HttpStatus.BAD_REQUEST,
        'INVALID_REORDER_ITEMS'
      );
    }

    // Step 1: Shift to safe offset positions (> 0 to satisfy check constraint)
    for (let i = 0; i < dto.items.length; i++) {
      await this.db
        .update(quizQuestions)
        .set({ position: 100000 + i, updatedAt: new Date() })
        .where(eq(quizQuestions.id, dto.items[i].id));
    }

    // Step 2: Set final target positions
    for (const item of dto.items) {
      await this.db
        .update(quizQuestions)
        .set({ position: item.position, updatedAt: new Date() })
        .where(eq(quizQuestions.id, item.id));
    }

    return { success: true, count: dto.items.length };
  }
}
