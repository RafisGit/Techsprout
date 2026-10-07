import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orders } from './orders';
import { users } from './users';
import { courses } from './courses';
import { enrollments } from './enrollments';
import { refunds } from './refunds';

// --- ENUMS ---
export const refundRequestStatusEnum = pgEnum('refund_request_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

export const refundRequestReasonCategoryEnum = pgEnum('refund_request_reason_category', [
  'COURSE_CONTENT_MISMATCH',
  'TECHNICAL_ISSUES',
  'ACCIDENTAL_PURCHASE',
  'PERSONAL_REASONS',
  'OTHER',
]);

// --- REFUND REQUESTS TABLE ---
export const refundRequests = pgTable(
  'refund_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestNumber: varchar('request_number', { length: 50 }).notNull(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'restrict' })
      .notNull(),
    enrollmentId: uuid('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'restrict' })
      .notNull(),
    reasonCategory: refundRequestReasonCategoryEnum('reason_category').notNull(),
    reasonDetail: text('reason_detail').notNull(),
    courseProgressAtRequest: integer('course_progress_at_request').notNull(),
    status: refundRequestStatusEnum('status').default('PENDING').notNull(),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    adminNotes: text('admin_notes'),
    refundId: uuid('refund_id').references(() => refunds.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('refund_requests_request_number_uq').on(table.requestNumber),
    uniqueIndex('refund_requests_active_order_uq')
      .on(table.orderId)
      .where(sql`"status" IN ('PENDING', 'APPROVED')`),
    index('refund_requests_student_id_idx').on(table.studentId),
    index('refund_requests_course_id_idx').on(table.courseId),
    index('refund_requests_status_idx').on(table.status),
    index('refund_requests_created_at_idx').on(table.createdAt),
    index('refund_requests_reviewed_by_idx').on(table.reviewedBy),
    check(
      'refund_requests_progress_range',
      sql`"course_progress_at_request" >= 0 AND "course_progress_at_request" <= 100`
    ),
    check('refund_requests_reason_detail_min_len', sql`length(trim("reason_detail")) >= 10`),
  ]
);

export type RefundRequest = typeof refundRequests.$inferSelect;
export type NewRefundRequest = typeof refundRequests.$inferInsert;
