import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, not, sql, inArray } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  quizzes,
  quizQuestions,
  quizQuestionOptions,
  quizAttempts,
  modules,
  courses,
  QuizQuestionOption,
  QuizQuestion,
  Quiz,
} from '../../database/schema';
import { UserContext } from '../courses/courses.service';
import { ApiException } from '../../common/errors/api-error';
import { CreateOptionDto } from './dto/create-option.dto';
import { UpdateOptionDto } from './dto/update-option.dto';
import { ReorderDto } from './dto/reorder.dto';
import { QuestionsService } from './questions.service';
import { validateQuestionOptions } from './quizzes.validator';

@Injectable()
export class OptionsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(QuestionsService) private readonly questionsService: QuestionsService
  ) {}

  /**
   * Resolve option ownership chain: option -> question -> quiz -> module -> course -> course.instructorId
   */
  async resolveOptionOwnership(
    optionId: string,
    user: UserContext
  ): Promise<{
    option: QuizQuestionOption;
    question: QuizQuestion;
    quiz: Quiz;
    module: { id: string; title: string; courseId: string };
    course: { id: string; title: string; instructorId: string };
  }> {
    const [result] = await this.db
      .select({
        option: quizQuestionOptions,
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
      .from(quizQuestionOptions)
      .innerJoin(quizQuestions, eq(quizQuestionOptions.questionId, quizQuestions.id))
      .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(quizQuestionOptions.id, optionId))
      .limit(1);

    if (!result) {
      throw new ApiException(
        `Option with ID "${optionId}" not found`,
        HttpStatus.NOT_FOUND,
        'OPTION_NOT_FOUND'
      );
    }

    if (user.role === 'instructor' && result.course.instructorId !== user.id) {
      throw new ApiException(
        'Access denied: you do not own the course containing this option',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return result;
  }

  async create(
    questionId: string,
    dto: CreateOptionDto,
    user: UserContext
  ): Promise<QuizQuestionOption> {
    const { question, quiz } = await this.questionsService.resolveQuestionOwnership(
      questionId,
      user
    );

    if (quiz.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot add options to an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    // Check attempts on quiz
    const [attemptCountRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, quiz.id));

    if (Number(attemptCountRes?.count || 0) > 0) {
      throw new ApiException(
        'Cannot add options to a quiz with recorded student attempts',
        HttpStatus.CONFLICT,
        'QUIZ_HAS_ATTEMPTS'
      );
    }

    // TRUE_FALSE limits
    if (question.questionType === 'TRUE_FALSE') {
      const existingOptions = await this.db
        .select()
        .from(quizQuestionOptions)
        .where(eq(quizQuestionOptions.questionId, questionId));

      if (existingOptions.length >= 2) {
        throw new ApiException(
          'TRUE_FALSE questions cannot have more than 2 options',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'OPTION_INVALID'
        );
      }

      const lower = dto.optionText.trim().toLowerCase();
      if (lower !== 'true' && lower !== 'false') {
        throw new ApiException(
          'TRUE_FALSE option text must be "True" or "False"',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'OPTION_INVALID'
        );
      }
    }

    // Position conflict
    const [posConflict] = await this.db
      .select()
      .from(quizQuestionOptions)
      .where(
        and(
          eq(quizQuestionOptions.questionId, questionId),
          eq(quizQuestionOptions.position, dto.position)
        )
      )
      .limit(1);

    if (posConflict) {
      throw new ApiException(
        `Option position ${dto.position} is already taken in this question`,
        HttpStatus.CONFLICT,
        'OPTION_POSITION_EXISTS'
      );
    }

    const isCorrect = dto.isCorrect !== undefined ? dto.isCorrect : false;

    // If quiz is published, ensure the new option preserves question validity
    if (quiz.status === 'PUBLISHED') {
      const existingOptions = await this.db
        .select()
        .from(quizQuestionOptions)
        .where(eq(quizQuestionOptions.questionId, questionId));

      const simulated = [
        ...existingOptions.map((o) => ({
          optionText: o.optionText,
          position: o.position,
          isCorrect: o.isCorrect,
        })),
        {
          optionText: dto.optionText,
          position: dto.position,
          isCorrect,
        },
      ];

      const validation = validateQuestionOptions(question.questionType, simulated);
      if (!validation.isValid) {
        throw new ApiException(
          `Cannot add option to published quiz: ${validation.error}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'OPTION_INVALID'
        );
      }
    }

    const [created] = await this.db
      .insert(quizQuestionOptions)
      .values({
        questionId,
        optionText: dto.optionText,
        position: dto.position,
        isCorrect,
      })
      .returning();

    return created;
  }

  async update(
    optionId: string,
    dto: UpdateOptionDto,
    user: UserContext
  ): Promise<QuizQuestionOption> {
    const { option: existing, question, quiz } = await this.resolveOptionOwnership(
      optionId,
      user
    );

    if (quiz.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot modify options of an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    const [attemptCountRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, quiz.id));

    if (Number(attemptCountRes?.count || 0) > 0) {
      throw new ApiException(
        'Cannot modify options of a quiz with recorded student attempts',
        HttpStatus.CONFLICT,
        'QUIZ_HAS_ATTEMPTS'
      );
    }

    if (question.questionType === 'TRUE_FALSE' && dto.optionText !== undefined) {
      const lower = dto.optionText.trim().toLowerCase();
      if (lower !== 'true' && lower !== 'false') {
        throw new ApiException(
          'TRUE_FALSE option text must be "True" or "False"',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'OPTION_INVALID'
        );
      }
    }

    if (dto.position !== undefined && dto.position !== existing.position) {
      const [posConflict] = await this.db
        .select()
        .from(quizQuestionOptions)
        .where(
          and(
            eq(quizQuestionOptions.questionId, existing.questionId),
            eq(quizQuestionOptions.position, dto.position),
            not(eq(quizQuestionOptions.id, optionId))
          )
        )
        .limit(1);

      if (posConflict) {
        throw new ApiException(
          `Option position ${dto.position} is already taken in this question`,
          HttpStatus.CONFLICT,
          'OPTION_POSITION_EXISTS'
        );
      }
    }

    // If quiz is published, check option updates don't break publication rules
    if (quiz.status === 'PUBLISHED') {
      const allOptions = await this.db
        .select()
        .from(quizQuestionOptions)
        .where(eq(quizQuestionOptions.questionId, existing.questionId));

      const simulated = allOptions.map((o) => {
        if (o.id === optionId) {
          return {
            optionText: dto.optionText !== undefined ? dto.optionText : o.optionText,
            position: dto.position !== undefined ? dto.position : o.position,
            isCorrect: dto.isCorrect !== undefined ? dto.isCorrect : o.isCorrect,
          };
        }
        return {
          optionText: o.optionText,
          position: o.position,
          isCorrect: o.isCorrect,
        };
      });

      const validation = validateQuestionOptions(question.questionType, simulated);
      if (!validation.isValid) {
        throw new ApiException(
          `Cannot update option on published quiz: ${validation.error}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'OPTION_INVALID'
        );
      }
    }

    const updates: Partial<typeof quizQuestionOptions.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.optionText !== undefined) updates.optionText = dto.optionText;
    if (dto.position !== undefined) updates.position = dto.position;
    if (dto.isCorrect !== undefined) updates.isCorrect = dto.isCorrect;

    const [updated] = await this.db
      .update(quizQuestionOptions)
      .set(updates)
      .where(eq(quizQuestionOptions.id, optionId))
      .returning();

    return updated;
  }

  async delete(
    optionId: string,
    user: UserContext
  ): Promise<{ deleted: true; id: string }> {
    const { option: existing, question, quiz } = await this.resolveOptionOwnership(
      optionId,
      user
    );

    if (quiz.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot delete options from an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    const [attemptCountRes] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, quiz.id));

    if (Number(attemptCountRes?.count || 0) > 0) {
      throw new ApiException(
        'Cannot delete options from a quiz with recorded student attempts',
        HttpStatus.CONFLICT,
        'QUIZ_HAS_ATTEMPTS'
      );
    }

    if (quiz.status === 'PUBLISHED') {
      const allOptions = await this.db
        .select()
        .from(quizQuestionOptions)
        .where(eq(quizQuestionOptions.questionId, existing.questionId));

      const remaining = allOptions
        .filter((o) => o.id !== optionId)
        .map((o) => ({
          optionText: o.optionText,
          position: o.position,
          isCorrect: o.isCorrect,
        }));

      const validation = validateQuestionOptions(question.questionType, remaining);
      if (!validation.isValid) {
        throw new ApiException(
          `Cannot delete option on published quiz: ${validation.error}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'OPTION_INVALID'
        );
      }
    }

    await this.db
      .delete(quizQuestionOptions)
      .where(eq(quizQuestionOptions.id, optionId));

    return { deleted: true, id: optionId };
  }

  async reorder(
    questionId: string,
    dto: ReorderDto,
    user: UserContext
  ): Promise<{ success: boolean; count: number }> {
    const { quiz } = await this.questionsService.resolveQuestionOwnership(
      questionId,
      user
    );

    if (quiz.status === 'ARCHIVED') {
      throw new ApiException(
        'Cannot reorder options in an archived quiz',
        HttpStatus.CONFLICT,
        'QUIZ_ALREADY_ARCHIVED'
      );
    }

    const ids = dto.items.map((i) => i.id);
    const existing = await this.db
      .select({ id: quizQuestionOptions.id })
      .from(quizQuestionOptions)
      .where(
        and(
          eq(quizQuestionOptions.questionId, questionId),
          inArray(quizQuestionOptions.id, ids)
        )
      );

    if (existing.length !== ids.length) {
      throw new ApiException(
        'One or more option IDs do not belong to this question',
        HttpStatus.BAD_REQUEST,
        'INVALID_REORDER_ITEMS'
      );
    }

    // Step 1: Shift to safe offset positions (> 0 to satisfy check constraint)
    for (let i = 0; i < dto.items.length; i++) {
      await this.db
        .update(quizQuestionOptions)
        .set({ position: 100000 + i, updatedAt: new Date() })
        .where(eq(quizQuestionOptions.id, dto.items[i].id));
    }

    // Step 2: Set final target positions
    for (const item of dto.items) {
      await this.db
        .update(quizQuestionOptions)
        .set({ position: item.position, updatedAt: new Date() })
        .where(eq(quizQuestionOptions.id, item.id));
    }

    return { success: true, count: dto.items.length };
  }
}
