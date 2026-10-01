import {
  pgTable,
  uuid,
  integer,
  numeric,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  text,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { quizzes, quizQuestions } from './quizzes';
import { enrollments } from './enrollments';
import { users } from './users';

// --- ENUMS ---
export const attemptStatusEnum = pgEnum('attempt_status', [
  'IN_PROGRESS',
  'SUBMITTED',
  'ABANDONED',
]);

// --- QUIZ ATTEMPTS TABLE ---
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'restrict' })
      .notNull(),
    enrollmentId: uuid('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    status: attemptStatusEnum('status').default('IN_PROGRESS').notNull(),
    score: integer('score').default(0).notNull(),
    totalPoints: integer('total_points').default(0).notNull(),
    percentage: numeric('percentage', { precision: 5, scale: 2 }).default('0.00').notNull(),
    isPassed: boolean('is_passed').default(false).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    lastSavedAt: timestamp('last_saved_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quiz_attempts_enrollment_quiz_num_uq').on(
      table.enrollmentId,
      table.quizId,
      table.attemptNumber
    ),
    index('quiz_attempts_enrollment_id_idx').on(table.enrollmentId),
    index('quiz_attempts_quiz_id_idx').on(table.quizId),
    index('quiz_attempts_student_id_idx').on(table.studentId),
    index('quiz_attempts_status_idx').on(table.status),
    check('quiz_attempts_attempt_number_positive', sql`"attempt_number" > 0`),
    check('quiz_attempts_score_non_negative', sql`"score" >= 0`),
    check('quiz_attempts_total_points_non_negative', sql`"total_points" >= 0`),
    check(
      'quiz_attempts_percentage_range',
      sql`"percentage" >= 0 AND "percentage" <= 100`
    ),
  ]
);

// --- QUIZ ATTEMPT ANSWERS TABLE ---
export const quizAttemptAnswers = pgTable(
  'quiz_attempt_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    attemptId: uuid('attempt_id')
      .references(() => quizAttempts.id, { onDelete: 'cascade' })
      .notNull(),
    questionId: uuid('question_id')
      .references(() => quizQuestions.id, { onDelete: 'restrict' })
      .notNull(),
    selectedOptionIds: text('selected_option_ids').array().notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
    pointsAwarded: integer('points_awarded').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quiz_attempt_answers_attempt_q_uq').on(table.attemptId, table.questionId),
    index('quiz_attempt_answers_attempt_id_idx').on(table.attemptId),
    index('quiz_attempt_answers_question_id_idx').on(table.questionId),
    check(
      'quiz_attempt_answers_points_awarded_non_negative',
      sql`"points_awarded" >= 0`
    ),
  ]
);

export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type NewQuizAttempt = typeof quizAttempts.$inferInsert;
export type QuizAttemptAnswer = typeof quizAttemptAnswers.$inferSelect;
export type NewQuizAttemptAnswer = typeof quizAttemptAnswers.$inferInsert;
