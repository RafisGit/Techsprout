import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { eq, and, sql, asc, inArray, count } from 'drizzle-orm';
import { DRIZZLE_DB, DrizzleDB } from '../../database/drizzle.provider';
import {
  quizzes,
  modules,
  courses,
  enrollments,
  quizQuestions,
  quizQuestionOptions,
  quizAttempts,
  quizAttemptAnswers,
  lessons,
  lessonProgress,
  QuizQuestionOption,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { CertificateService } from '../certificates/certificates.service';
import { UserContext } from '../courses/courses.service';
import { ApiException } from '../../common/errors/api-error';
import {
  SaveAnswersDto,
  SubmitAttemptDto,
  StudentQuizDto,
  StudentQuizQuestionDto,
  StudentQuizOptionDto,
  StudentActiveAttemptDto,
  StudentQuizResultDto,
  StudentQuizReviewDto,
  QuestionReviewDto,
} from './dto/save-answers.dto';

@Injectable()
export class StudentQuizzesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDB,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(CertificateService) private readonly certificateService: CertificateService
  ) {}

  /**
   * Helper: verify student eligibility and resolve quiz context
   */
  async verifyQuizAccess(
    quizId: string,
    user: UserContext
  ): Promise<{
    quiz: typeof quizzes.$inferSelect;
    module: { id: string; courseId: string };
    course: { id: string; status: string; visibility: string };
    enrollment: typeof enrollments.$inferSelect;
  }> {
    const [result] = await this.db
      .select({
        quiz: quizzes,
        module: {
          id: modules.id,
          courseId: modules.courseId,
        },
        course: {
          id: courses.id,
          status: courses.status,
          visibility: courses.visibility,
        },
      })
      .from(quizzes)
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!result || result.quiz.status !== 'PUBLISHED') {
      throw new ApiException('Quiz not found', HttpStatus.NOT_FOUND, 'QUIZ_NOT_FOUND');
    }

    // Verify course learning access:
    // If course is draft, only admin / owner instructor can view
    if (result.course.status === 'DRAFT' && user.role !== 'admin') {
      throw new ApiException(
        'Access denied: Course is not available',
        HttpStatus.FORBIDDEN,
        'COURSE_NOT_AVAILABLE'
      );
    }

    // Verify enrollment
    const [enrollment] = await this.db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, user.id),
          eq(enrollments.courseId, result.course.id)
        )
      )
      .limit(1);

    if (!enrollment) {
      throw new ApiException(
        'Access denied: Enrollment required to access this assessment',
        HttpStatus.FORBIDDEN,
        'ENROLLMENT_REQUIRED'
      );
    }

    if (enrollment.status === 'CANCELLED') {
      throw new ApiException(
        'Access denied: Enrollment has been cancelled',
        HttpStatus.FORBIDDEN,
        'ENROLLMENT_CANCELLED'
      );
    }

    if (enrollment.status !== 'ACTIVE' && enrollment.status !== 'COMPLETED') {
      throw new ApiException(
        'Access denied: Active enrollment required',
        HttpStatus.FORBIDDEN,
        'ENROLLMENT_REQUIRED'
      );
    }

    return {
      quiz: result.quiz,
      module: result.module,
      course: result.course,
      enrollment,
    };
  }

  /**
   * Helper: verify attempt ownership and resolve attempt context
   */
  async verifyAttemptAccess(
    quizId: string,
    attemptId: string,
    user: UserContext
  ): Promise<{
    attempt: typeof quizAttempts.$inferSelect;
    quiz: typeof quizzes.$inferSelect;
    enrollment: typeof enrollments.$inferSelect;
  }> {
    const [result] = await this.db
      .select({
        attempt: quizAttempts,
        quiz: quizzes,
        enrollment: enrollments,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .innerJoin(enrollments, eq(quizAttempts.enrollmentId, enrollments.id))
      .where(eq(quizAttempts.id, attemptId))
      .limit(1);

    if (!result) {
      throw new ApiException('Attempt not found', HttpStatus.NOT_FOUND, 'ATTEMPT_NOT_FOUND');
    }

    if (result.attempt.quizId !== quizId) {
      throw new ApiException(
        'Attempt does not belong to this quiz',
        HttpStatus.BAD_REQUEST,
        'INVALID_ATTEMPT'
      );
    }

    if (result.attempt.studentId !== user.id) {
      throw new ApiException(
        'Access denied: You do not own this attempt',
        HttpStatus.FORBIDDEN,
        'FORBIDDEN'
      );
    }

    return result;
  }

  /**
   * 1. GET /api/v1/learn/quizzes/:quizId
   * Returns student-safe quiz metadata and questions (NEVER leaks answer keys or explanations)
   */
  async getQuizForStudent(quizId: string, user: UserContext): Promise<StudentQuizDto> {
    const { quiz, course, enrollment } = await this.verifyQuizAccess(quizId, user);

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

    // Map options without isCorrect
    const optionsByQuestion = new Map<string, StudentQuizOptionDto[]>();
    for (const opt of optionsList) {
      const arr = optionsByQuestion.get(opt.questionId) || [];
      arr.push({
        id: opt.id,
        optionText: opt.optionText,
        position: opt.position,
      });
      optionsByQuestion.set(opt.questionId, arr);
    }

    // Map questions without explanation
    const studentQuestions: StudentQuizQuestionDto[] = questionsList.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      position: q.position,
      points: q.points,
      options: optionsByQuestion.get(q.id) || [],
    }));

    // Fetch attempts telemetry
    const attempts = await this.db
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quizId),
          eq(quizAttempts.enrollmentId, enrollment.id)
        )
      )
      .orderBy(asc(quizAttempts.attemptNumber));

    const submittedAttempts = attempts.filter((a) => a.status === 'SUBMITTED');
    const userAttemptsCount = attempts.filter(
      (a) => a.status === 'SUBMITTED' || a.status === 'ABANDONED'
    ).length;
    const isPassed = submittedAttempts.some((a) => a.isPassed);
    const bestScorePercentage =
      submittedAttempts.length > 0
        ? Math.max(...submittedAttempts.map((a) => Number(a.percentage)))
        : null;

    const totalPoints = questionsList.reduce((acc, q) => acc + q.points, 0);

    return {
      id: quiz.id,
      moduleId: quiz.moduleId,
      courseId: course.id,
      title: quiz.title,
      description: quiz.description,
      quizType: quiz.quizType,
      passingScorePercentage: quiz.passingScorePercentage,
      maxAttempts: quiz.maxAttempts,
      timeLimitMinutes: quiz.timeLimitMinutes,
      totalPoints,
      questionsCount: questionsList.length,
      userAttemptsCount,
      bestScorePercentage,
      isPassed,
      questions: studentQuestions,
    };
  }

  /**
   * 2. POST /api/v1/learn/quizzes/:quizId/attempts
   * Starts a new attempt or resumes existing active IN_PROGRESS attempt
   */
  async startOrResumeAttempt(
    quizId: string,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<StudentActiveAttemptDto> {
    const { quiz, course, enrollment } = await this.verifyQuizAccess(quizId, user);

    // 1. Check for existing active IN_PROGRESS attempt
    const [existingActive] = await this.db
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quizId),
          eq(quizAttempts.enrollmentId, enrollment.id),
          eq(quizAttempts.status, 'IN_PROGRESS')
        )
      )
      .limit(1);

    if (existingActive) {
      // Check timing expiration on active attempt
      if (quiz.timeLimitMinutes) {
        const expiresAt = new Date(
          existingActive.startedAt.getTime() + quiz.timeLimitMinutes * 60 * 1000
        );
        if (new Date().getTime() > expiresAt.getTime() + 30000) {
          // Attempt expired -> mark ABANDONED
          await this.db
            .update(quizAttempts)
            .set({ status: 'ABANDONED', updatedAt: new Date() })
            .where(eq(quizAttempts.id, existingActive.id));
        } else {
          // Resume existing attempt
          return this.buildActiveAttemptDto(existingActive, quiz);
        }
      } else {
        // Untimed: Resume existing attempt
        return this.buildActiveAttemptDto(existingActive, quiz);
      }
    }

    // 2. Enforce max attempts limit (count SUBMITTED + ABANDONED)
    const nonActiveResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quizId),
          eq(quizAttempts.enrollmentId, enrollment.id),
          sql`${quizAttempts.status} IN ('SUBMITTED', 'ABANDONED')`
        )
      );

    const completedAttemptsCount = Number(nonActiveResult[0]?.count || 0);

    if (quiz.maxAttempts !== null && completedAttemptsCount >= quiz.maxAttempts) {
      throw new ApiException(
        `Maximum number of attempts (${quiz.maxAttempts}) reached for this quiz`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'MAX_ATTEMPTS_REACHED',
        { maxAttempts: quiz.maxAttempts, userAttemptsCount: completedAttemptsCount }
      );
    }

    // 3. Create new attempt
    const nextAttemptNumber = completedAttemptsCount + 1;
    const now = new Date();

    const [created] = await this.db
      .insert(quizAttempts)
      .values({
        quizId,
        enrollmentId: enrollment.id,
        studentId: user.id,
        attemptNumber: nextAttemptNumber,
        status: 'IN_PROGRESS',
        startedAt: now,
        lastSavedAt: now,
      })
      .returning();

    // 4. Record audit event
    await this.auditService.record({
      actorId: user.id,
      action: 'QUIZ_ATTEMPT_STARTED',
      targetType: 'QUIZ',
      targetId: quizId,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        attemptId: created.id,
        attemptNumber: nextAttemptNumber,
        courseId: course.id,
        enrollmentId: enrollment.id,
      },
    });

    return this.buildActiveAttemptDto(created, quiz);
  }

  /**
   * Helper: build StudentActiveAttemptDto restoring questions and saved answers
   */
  private async buildActiveAttemptDto(
    attempt: typeof quizAttempts.$inferSelect,
    quiz: typeof quizzes.$inferSelect
  ): Promise<StudentActiveAttemptDto> {
    const questionsList = await this.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quiz.id))
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

    const optionsByQuestion = new Map<string, StudentQuizOptionDto[]>();
    for (const opt of optionsList) {
      const arr = optionsByQuestion.get(opt.questionId) || [];
      arr.push({
        id: opt.id,
        optionText: opt.optionText,
        position: opt.position,
      });
      optionsByQuestion.set(opt.questionId, arr);
    }

    const studentQuestions: StudentQuizQuestionDto[] = questionsList.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      position: q.position,
      points: q.points,
      options: optionsByQuestion.get(q.id) || [],
    }));

    // Fetch saved answers
    const savedAnswers = await this.db
      .select({
        questionId: quizAttemptAnswers.questionId,
        selectedOptionIds: quizAttemptAnswers.selectedOptionIds,
      })
      .from(quizAttemptAnswers)
      .where(eq(quizAttemptAnswers.attemptId, attempt.id));

    const expiresAt = quiz.timeLimitMinutes
      ? new Date(attempt.startedAt.getTime() + quiz.timeLimitMinutes * 60 * 1000).toISOString()
      : null;

    return {
      id: attempt.id,
      quizId: attempt.quizId,
      attemptNumber: attempt.attemptNumber,
      status: 'IN_PROGRESS',
      startedAt: attempt.startedAt.toISOString(),
      lastSavedAt: attempt.lastSavedAt.toISOString(),
      expiresAt,
      timeLimitMinutes: quiz.timeLimitMinutes,
      questions: studentQuestions,
      savedAnswers: savedAnswers.map((a) => ({
        questionId: a.questionId,
        selectedOptionIds: a.selectedOptionIds,
      })),
    };
  }

  /**
   * 3. GET /api/v1/learn/quizzes/:quizId/attempts/:attemptId
   * Returns active attempt details (if IN_PROGRESS) or score summary (if SUBMITTED)
   */
  async getAttemptDetail(
    quizId: string,
    attemptId: string,
    user: UserContext
  ): Promise<StudentActiveAttemptDto | StudentQuizResultDto> {
    const { attempt, quiz } = await this.verifyAttemptAccess(quizId, attemptId, user);

    if (attempt.status === 'IN_PROGRESS') {
      return this.buildActiveAttemptDto(attempt, quiz);
    }

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      attemptNumber: attempt.attemptNumber,
      status: 'SUBMITTED',
      score: attempt.score,
      totalPoints: attempt.totalPoints,
      percentage: Number(attempt.percentage),
      isPassed: attempt.isPassed,
      submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : attempt.updatedAt.toISOString(),
      courseProgressPercentage: 0,
      isCourseCompleted: false,
    };
  }

  /**
   * 4. PATCH /api/v1/learn/quizzes/:quizId/attempts/:attemptId/answers
   * Auto-saves student answer selections
   */
  async saveAnswers(
    quizId: string,
    attemptId: string,
    dto: SaveAnswersDto,
    user: UserContext
  ): Promise<{ attemptId: string; lastSavedAt: string }> {
    const { attempt, quiz } = await this.verifyAttemptAccess(quizId, attemptId, user);

    if (attempt.status === 'SUBMITTED') {
      throw new ApiException(
        'Cannot modify answers: Attempt has already been submitted',
        HttpStatus.CONFLICT,
        'ATTEMPT_ALREADY_SUBMITTED'
      );
    }

    if (attempt.status === 'ABANDONED') {
      throw new ApiException(
        'Cannot modify answers: Attempt is no longer active',
        HttpStatus.CONFLICT,
        'ATTEMPT_NOT_ACTIVE'
      );
    }

    // Check timing expiration
    if (quiz.timeLimitMinutes) {
      const expiration = new Date(
        attempt.startedAt.getTime() + quiz.timeLimitMinutes * 60 * 1000
      );
      if (new Date().getTime() > expiration.getTime() + 30000) {
        throw new ApiException(
          'Quiz time limit has expired',
          HttpStatus.CONFLICT,
          'QUIZ_TIME_EXPIRED'
        );
      }
    }

    // Validate questions and options
    const questionsList = await this.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));
    const questionMap = new Map(questionsList.map((q) => [q.id, q]));

    const questionIds = questionsList.map((q) => q.id);
    let optionsList: QuizQuestionOption[] = [];
    if (questionIds.length > 0) {
      optionsList = await this.db
        .select()
        .from(quizQuestionOptions)
        .where(inArray(quizQuestionOptions.questionId, questionIds));
    }

    const optionsByQuestion = new Map<string, Set<string>>();
    for (const opt of optionsList) {
      const s = optionsByQuestion.get(opt.questionId) || new Set<string>();
      s.add(opt.id);
      optionsByQuestion.set(opt.questionId, s);
    }

    const now = new Date();

    for (const ans of dto.answers) {
      const q = questionMap.get(ans.questionId);
      if (!q) {
        throw new ApiException(
          `Question ${ans.questionId} does not belong to this quiz`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVALID_ANSWER_SELECTION'
        );
      }

      const validOptionIds = optionsByQuestion.get(ans.questionId) || new Set<string>();
      for (const optId of ans.selectedOptionIds) {
        if (!validOptionIds.has(optId)) {
          throw new ApiException(
            `Option ${optId} does not belong to question ${ans.questionId}`,
            HttpStatus.UNPROCESSABLE_ENTITY,
            'INVALID_ANSWER_SELECTION'
          );
        }
      }

      // Check selection bounds by question type
      if (
        (q.questionType === 'SINGLE_CHOICE' || q.questionType === 'TRUE_FALSE') &&
        ans.selectedOptionIds.length > 1
      ) {
        throw new ApiException(
          `${q.questionType} questions allow at most 1 selected option`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'INVALID_ANSWER_SELECTION'
        );
      }

      // Upsert answer
      await this.db
        .insert(quizAttemptAnswers)
        .values({
          attemptId,
          questionId: ans.questionId,
          selectedOptionIds: ans.selectedOptionIds,
          isCorrect: false,
          pointsAwarded: 0,
        })
        .onConflictDoUpdate({
          target: [quizAttemptAnswers.attemptId, quizAttemptAnswers.questionId],
          set: {
            selectedOptionIds: ans.selectedOptionIds,
            updatedAt: now,
          },
        });
    }

    await this.db
      .update(quizAttempts)
      .set({ lastSavedAt: now, updatedAt: now })
      .where(eq(quizAttempts.id, attemptId));

    return {
      attemptId,
      lastSavedAt: now.toISOString(),
    };
  }

  /**
   * 5. POST /api/v1/learn/quizzes/:quizId/attempts/:attemptId/submit
   * Submits attempt for final authoritative server-side grading and course completion recalculation
   */
  async submitAttempt(
    quizId: string,
    attemptId: string,
    dto: SubmitAttemptDto,
    user: UserContext,
    ipAddress?: string,
    userAgent?: string,
    requestId?: string
  ): Promise<StudentQuizResultDto> {
    const { attempt, quiz, enrollment } = await this.verifyAttemptAccess(quizId, attemptId, user);

    if (attempt.status === 'SUBMITTED') {
      throw new ApiException(
        'Attempt has already been submitted',
        HttpStatus.CONFLICT,
        'ATTEMPT_ALREADY_SUBMITTED'
      );
    }

    if (attempt.status === 'ABANDONED') {
      throw new ApiException(
        'Cannot submit an abandoned attempt',
        HttpStatus.CONFLICT,
        'ATTEMPT_NOT_ACTIVE'
      );
    }

    // Check time limit with 30s grace window
    if (quiz.timeLimitMinutes) {
      const expiration = new Date(
        attempt.startedAt.getTime() + quiz.timeLimitMinutes * 60 * 1000
      );
      if (new Date().getTime() > expiration.getTime() + 30000) {
        throw new ApiException(
          'Quiz time limit has expired',
          HttpStatus.CONFLICT,
          'QUIZ_TIME_EXPIRED'
        );
      }
    }

    // If answers provided in submit payload, save them first
    if (dto.answers && dto.answers.length > 0) {
      await this.saveAnswers(quizId, attemptId, { answers: dto.answers }, user);
    }

    // Load authoritative questions and options
    const questionsList = await this.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.position));

    if (questionsList.length === 0) {
      throw new ApiException(
        'Quiz contains no questions and cannot be graded',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'QUIZ_INVALID_FOR_ATTEMPT'
      );
    }

    const questionIds = questionsList.map((q) => q.id);
    const optionsList = await this.db
      .select()
      .from(quizQuestionOptions)
      .where(inArray(quizQuestionOptions.questionId, questionIds))
      .orderBy(asc(quizQuestionOptions.position));

    const optionsByQuestion = new Map<string, QuizQuestionOption[]>();
    for (const opt of optionsList) {
      const arr = optionsByQuestion.get(opt.questionId) || [];
      arr.push(opt);
      optionsByQuestion.set(opt.questionId, arr);
    }

    // Load saved answers
    const savedAnswersList = await this.db
      .select()
      .from(quizAttemptAnswers)
      .where(eq(quizAttemptAnswers.attemptId, attemptId));
    const savedAnswersMap = new Map(savedAnswersList.map((a) => [a.questionId, a]));

    // Authoritative Server-Side Grading
    let totalScore = 0;
    let totalPoints = 0;
    const now = new Date();

    for (const question of questionsList) {
      totalPoints += question.points;
      const opts = optionsByQuestion.get(question.id) || [];
      const correctOptionIds = opts.filter((o) => o.isCorrect).map((o) => o.id);
      const studentAns = savedAnswersMap.get(question.id);
      const selectedOptionIds = studentAns ? studentAns.selectedOptionIds : [];

      let isCorrect = false;
      if (question.questionType === 'SINGLE_CHOICE' || question.questionType === 'TRUE_FALSE') {
        isCorrect =
          selectedOptionIds.length === 1 &&
          correctOptionIds.length === 1 &&
          selectedOptionIds[0] === correctOptionIds[0];
      } else if (question.questionType === 'MULTIPLE_CHOICE') {
        const selectedSet = new Set(selectedOptionIds);
        const correctSet = new Set(correctOptionIds);
        isCorrect =
          selectedSet.size === correctSet.size &&
          [...selectedSet].every((id) => correctSet.has(id));
      }

      const pointsAwarded = isCorrect ? question.points : 0;
      totalScore += pointsAwarded;

      // Update question answer record with grading evaluation
      await this.db
        .insert(quizAttemptAnswers)
        .values({
          attemptId,
          questionId: question.id,
          selectedOptionIds,
          isCorrect,
          pointsAwarded,
        })
        .onConflictDoUpdate({
          target: [quizAttemptAnswers.attemptId, quizAttemptAnswers.questionId],
          set: {
            isCorrect,
            pointsAwarded,
            updatedAt: now,
          },
        });
    }

    if (totalPoints <= 0) {
      throw new ApiException(
        'Quiz has 0 total points and cannot be graded',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'QUIZ_INVALID_FOR_ATTEMPT'
      );
    }

    const percentage = Math.round((totalScore / totalPoints) * 100);
    const isPassed = percentage >= quiz.passingScorePercentage;

    const [updatedAttempt] = await this.db
      .update(quizAttempts)
      .set({
        status: 'SUBMITTED',
        score: totalScore,
        totalPoints,
        percentage: percentage.toFixed(2),
        isPassed,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(quizAttempts.id, attemptId))
      .returning();

    // Emit assessment audit events
    await this.auditService.record({
      actorId: user.id,
      action: 'QUIZ_ATTEMPT_SUBMITTED',
      targetType: 'QUIZ',
      targetId: quizId,
      ipAddress,
      userAgent,
      requestId,
      metadata: {
        attemptId: updatedAttempt.id,
        attemptNumber: updatedAttempt.attemptNumber,
        score: totalScore,
        totalPoints,
        percentage,
        isPassed,
      },
    });

    if (isPassed) {
      await this.auditService.record({
        actorId: user.id,
        action: 'QUIZ_PASSED',
        targetType: 'QUIZ',
        targetId: quizId,
        ipAddress,
        userAgent,
        requestId,
        metadata: {
          attemptId: updatedAttempt.id,
          attemptNumber: updatedAttempt.attemptNumber,
          score: totalScore,
          percentage,
        },
      });
    } else {
      await this.auditService.record({
        actorId: user.id,
        action: 'QUIZ_FAILED',
        targetType: 'QUIZ',
        targetId: quizId,
        ipAddress,
        userAgent,
        requestId,
        metadata: {
          attemptId: updatedAttempt.id,
          attemptNumber: updatedAttempt.attemptNumber,
          score: totalScore,
          percentage,
        },
      });
    }

    // Resolve courseId from module
    const [modRecord] = await this.db
      .select({ courseId: modules.courseId })
      .from(modules)
      .where(eq(modules.id, quiz.moduleId))
      .limit(1);

    const progress = await this.recalculateProgressAndCompletion(
      modRecord.courseId,
      enrollment.id,
      user.id,
      { ipAddress, userAgent, requestId }
    );

    return {
      attemptId: updatedAttempt.id,
      quizId: updatedAttempt.quizId,
      attemptNumber: updatedAttempt.attemptNumber,
      status: 'SUBMITTED',
      score: updatedAttempt.score,
      totalPoints: updatedAttempt.totalPoints,
      percentage,
      isPassed: updatedAttempt.isPassed,
      submittedAt: updatedAttempt.submittedAt!.toISOString(),
      courseProgressPercentage: progress.progressPercentage,
      isCourseCompleted: progress.isCourseCompleted,
    };
  }

  /**
   * 6. GET /api/v1/learn/quizzes/:quizId/attempts/:attemptId/review
   * Provides full review with questions, selections, correct answers, and explanations (SUBMITTED attempts only)
   */
  async getAttemptReview(
    quizId: string,
    attemptId: string,
    user: UserContext
  ): Promise<StudentQuizReviewDto> {
    const { attempt, quiz } = await this.verifyAttemptAccess(quizId, attemptId, user);

    if (attempt.status === 'IN_PROGRESS') {
      throw new ApiException(
        'Attempt is still in progress. Review is only available after submission.',
        HttpStatus.FORBIDDEN,
        'ATTEMPT_IN_PROGRESS'
      );
    }

    if (attempt.status === 'ABANDONED') {
      throw new ApiException(
        'Cannot review an abandoned attempt',
        HttpStatus.FORBIDDEN,
        'ATTEMPT_NOT_SUBMITTED'
      );
    }

    const questionsList = await this.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
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

    const answersList = await this.db
      .select()
      .from(quizAttemptAnswers)
      .where(eq(quizAttemptAnswers.attemptId, attemptId));
    const answersMap = new Map(answersList.map((a) => [a.questionId, a]));

    const reviewQuestions: QuestionReviewDto[] = questionsList.map((q) => {
      const opts = optionsByQuestion.get(q.id) || [];
      const ans = answersMap.get(q.id);
      return {
        questionId: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        points: q.points,
        pointsAwarded: ans ? ans.pointsAwarded : 0,
        isCorrect: ans ? ans.isCorrect : false,
        selectedOptionIds: ans ? ans.selectedOptionIds : [],
        correctOptionIds: opts.filter((o) => o.isCorrect).map((o) => o.id),
        explanation: q.explanation,
        options: opts.map((o) => ({
          id: o.id,
          optionText: o.optionText,
          position: o.position,
          isCorrect: o.isCorrect,
        })),
      };
    });

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      attemptNumber: attempt.attemptNumber,
      status: 'SUBMITTED',
      score: attempt.score,
      totalPoints: attempt.totalPoints,
      percentage: Number(attempt.percentage),
      isPassed: attempt.isPassed,
      submittedAt: attempt.submittedAt!.toISOString(),
      questions: reviewQuestions,
    };
  }

  /**
   * Unified Course Progress & Completion Recalculation (P3/P4 Invariant)
   * Course Progress % = round((Completed Lessons + Passed Quizzes) / (Total Lessons + Published Quizzes) * 100)
   */
  async recalculateProgressAndCompletion(
    courseId: string,
    enrollmentId: string,
    studentId: string,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
    }
  ): Promise<{
    totalLessons: number;
    completedLessons: number;
    publishedQuizzes: number;
    passedQuizzes: number;
    totalItems: number;
    completedItems: number;
    progressPercentage: number;
    isCourseCompleted: boolean;
  }> {
    // 1. Total lessons
    const [totalLessonsRes] = await this.db
      .select({ count: count(lessons.id) })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, courseId));
    const totalLessons = Number(totalLessonsRes?.count || 0);

    // 2. Completed lessons
    const [completedLessonsRes] = await this.db
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
    const completedLessons = Number(completedLessonsRes?.count || 0);

    // 3. Published quizzes in course
    const [publishedQuizzesRes] = await this.db
      .select({ count: count(quizzes.id) })
      .from(quizzes)
      .innerJoin(modules, eq(quizzes.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, courseId),
          eq(quizzes.status, 'PUBLISHED')
        )
      );
    const publishedQuizzes = Number(publishedQuizzesRes?.count || 0);

    // 4. Distinct passed published quizzes
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

    // Check enrollment state
    const [enr] = await this.db
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, enrollmentId))
      .limit(1);

    if (enr) {
      const now = new Date();
      if (isCourseCompleted && enr.status !== 'COMPLETED') {
        await this.db
          .update(enrollments)
          .set({
            status: 'COMPLETED',
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(enrollments.id, enrollmentId));

        await this.auditService.record({
          actorId: studentId,
          action: 'ENROLLMENT_COMPLETED',
          targetType: 'ENROLLMENT',
          targetId: enrollmentId,
          metadata: {
            studentId,
            courseId,
            totalItems,
            completedItems,
            completedAt: now,
          },
        });

        await this.certificateService.issueCertificateIfEligible(enrollmentId, {
          actorId: studentId,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
        });
      } else if (!isCourseCompleted && enr.status === 'COMPLETED') {
        // Curriculum mutation: New requirements added, revert to ACTIVE
        await this.db
          .update(enrollments)
          .set({
            status: 'ACTIVE',
            completedAt: null,
            updatedAt: now,
          })
          .where(eq(enrollments.id, enrollmentId));
      }
    }

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
}
