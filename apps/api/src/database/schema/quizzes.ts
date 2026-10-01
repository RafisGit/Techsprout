import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { modules } from './modules';

// --- ENUMS ---
export const quizStatusEnum = pgEnum('quiz_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const quizTypeEnum = pgEnum('quiz_type', ['KNOWLEDGE_CHECK', 'FINAL_EXAM']);
export const questionTypeEnum = pgEnum('question_type', [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
]);

// --- QUIZZES TABLE ---
export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .references(() => modules.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    position: integer('position').notNull(),
    quizType: quizTypeEnum('quiz_type').default('KNOWLEDGE_CHECK').notNull(),
    passingScorePercentage: integer('passing_score_percentage').default(70).notNull(),
    maxAttempts: integer('max_attempts').default(3), // null = unlimited
    timeLimitMinutes: integer('time_limit_minutes'), // null = untimed
    status: quizStatusEnum('status').default('DRAFT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quizzes_module_position_uq').on(table.moduleId, table.position),
    index('quizzes_module_id_idx').on(table.moduleId),
    index('quizzes_status_idx').on(table.status),
    index('quizzes_quiz_type_idx').on(table.quizType),
    check('quizzes_position_positive', sql`"position" > 0`),
    check(
      'quizzes_passing_score_range',
      sql`"passing_score_percentage" >= 1 AND "passing_score_percentage" <= 100`
    ),
    check('quizzes_max_attempts_positive', sql`"max_attempts" IS NULL OR "max_attempts" > 0`),
    check(
      'quizzes_time_limit_positive',
      sql`"time_limit_minutes" IS NULL OR "time_limit_minutes" > 0`
    ),
  ]
);

// --- QUIZ QUESTIONS TABLE ---
export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quizId: uuid('quiz_id')
      .references(() => quizzes.id, { onDelete: 'cascade' })
      .notNull(),
    questionText: text('question_text').notNull(),
    questionType: questionTypeEnum('question_type').default('SINGLE_CHOICE').notNull(),
    position: integer('position').notNull(),
    points: integer('points').default(1).notNull(),
    explanation: text('explanation'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quiz_questions_quiz_position_uq').on(table.quizId, table.position),
    index('quiz_questions_quiz_id_idx').on(table.quizId),
    check('quiz_questions_position_positive', sql`"position" > 0`),
    check('quiz_questions_points_positive', sql`"points" > 0`),
  ]
);

// --- QUIZ QUESTION OPTIONS TABLE ---
export const quizQuestionOptions = pgTable(
  'quiz_question_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    questionId: uuid('question_id')
      .references(() => quizQuestions.id, { onDelete: 'cascade' })
      .notNull(),
    optionText: text('option_text').notNull(),
    position: integer('position').notNull(),
    isCorrect: boolean('is_correct').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quiz_question_options_q_pos_uq').on(table.questionId, table.position),
    index('quiz_question_options_question_id_idx').on(table.questionId),
    check('quiz_question_options_position_positive', sql`"position" > 0`),
  ]
);

export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type NewQuizQuestion = typeof quizQuestions.$inferInsert;
export type QuizQuestionOption = typeof quizQuestionOptions.$inferSelect;
export type NewQuizQuestionOption = typeof quizQuestionOptions.$inferInsert;
