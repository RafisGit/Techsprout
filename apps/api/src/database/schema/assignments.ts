import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core';
import { courses } from './courses';
import { lessons } from './lessons';
import { users } from './users';

// --- ENUMS ---
export const assignmentStatusEnum = pgEnum('assignment_status', [
  'DRAFT',
  'PUBLISHED',
  'CLOSED',
]);

export const submissionStatusEnum = pgEnum('submission_status', [
  'SUBMITTED',
  'GRADED',
  'RESUBMITTED',
]);

// --- ASSIGNMENTS TABLE ---
export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    lessonId: uuid('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    instructions: text('instructions'),
    rubric: jsonb('rubric'),
    maxScore: integer('max_score').default(100).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    status: assignmentStatusEnum('status').default('DRAFT').notNull(),
    allowResubmission: boolean('allow_resubmission').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('assignments_course_status_idx').on(table.courseId, table.status),
    index('assignments_lesson_id_idx').on(table.lessonId),
  ]
);

// --- ASSIGNMENT SUBMISSIONS TABLE ---
export const assignmentSubmissions = pgTable(
  'assignment_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .references(() => assignments.id, { onDelete: 'cascade' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    version: integer('version').default(1).notNull(),
    fileUrl: text('file_url').notNull(),
    fileStorageKey: varchar('file_storage_key', { length: 255 }).notNull(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    studentNotes: text('student_notes'),
    status: submissionStatusEnum('status').default('SUBMITTED').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('assignment_submissions_assignment_student_idx').on(table.assignmentId, table.studentId),
    index('assignment_submissions_student_id_idx').on(table.studentId),
    index('assignment_submissions_status_idx').on(table.status),
  ]
);

// --- ASSIGNMENT GRADES TABLE ---
export const assignmentGrades = pgTable(
  'assignment_grades',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submissionId: uuid('submission_id')
      .references(() => assignmentSubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    graderId: uuid('grader_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    score: integer('score').notNull(),
    feedback: text('feedback'),
    rubricEvaluation: jsonb('rubric_evaluation'),
    gradedAt: timestamp('graded_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('assignment_grades_submission_id_uq').on(table.submissionId),
    index('assignment_grades_grader_id_idx').on(table.graderId),
  ]
);

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type NewAssignmentSubmission = typeof assignmentSubmissions.$inferInsert;
export type AssignmentGrade = typeof assignmentGrades.$inferSelect;
export type NewAssignmentGrade = typeof assignmentGrades.$inferInsert;
