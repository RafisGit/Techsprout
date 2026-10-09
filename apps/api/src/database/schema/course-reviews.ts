import { pgTable, uuid, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { courses } from './courses';
import { users } from './users';

export const courseReviewStatusEnum = pgEnum('course_review_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
]);

export const courseReviewRequests = pgTable(
  'course_review_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    instructorId: uuid('instructor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    status: courseReviewStatusEnum('status').default('PENDING').notNull(),
    submissionNotes: text('submission_notes'),
    adminFeedback: text('admin_feedback'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('course_reviews_course_id_idx').on(table.courseId),
    index('course_reviews_instructor_id_idx').on(table.instructorId),
    index('course_reviews_status_idx').on(table.status),
    index('course_reviews_course_status_idx').on(table.courseId, table.status),
  ]
);

export type CourseReviewRequest = typeof courseReviewRequests.$inferSelect;
export type NewCourseReviewRequest = typeof courseReviewRequests.$inferInsert;
