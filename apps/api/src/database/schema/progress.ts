import {
  pgTable,
  uuid,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { enrollments } from './enrollments';
import { lessons } from './lessons';

// --- ENUMS ---
export const lessonProgressStatusEnum = pgEnum('lesson_progress_status', [
  'IN_PROGRESS',
  'COMPLETED',
]);

// --- LESSON PROGRESS TABLE ---
export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    enrollmentId: uuid('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'cascade' })
      .notNull(),
    lessonId: uuid('lesson_id')
      .references(() => lessons.id, { onDelete: 'restrict' })
      .notNull(),
    status: lessonProgressStatusEnum('status').default('IN_PROGRESS').notNull(),
    watchPositionSeconds: integer('watch_position_seconds').default(0).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('lesson_progress_enrollment_lesson_uq').on(
      table.enrollmentId,
      table.lessonId
    ),
    index('lesson_progress_enrollment_id_idx').on(table.enrollmentId),
    index('lesson_progress_enrollment_status_idx').on(table.enrollmentId, table.status),
    index('lesson_progress_lesson_id_idx').on(table.lessonId),
    index('lesson_progress_last_accessed_idx').on(table.lastAccessedAt),
  ]
);

export type LessonProgress = typeof lessonProgress.$inferSelect;
export type NewLessonProgress = typeof lessonProgress.$inferInsert;
