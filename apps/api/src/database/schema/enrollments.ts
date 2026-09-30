import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { courses } from './courses';

// --- ENUMS ---
export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
]);

// --- ENROLLMENTS TABLE ---
export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'restrict' })
      .notNull(),
    status: enrollmentStatusEnum('status').default('ACTIVE').notNull(),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('enrollments_student_course_uq').on(table.studentId, table.courseId),
    index('enrollments_student_id_idx').on(table.studentId, table.status),
    index('enrollments_course_id_idx').on(table.courseId, table.status),
    index('enrollments_enrolled_at_idx').on(table.enrolledAt),
  ]
);

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
