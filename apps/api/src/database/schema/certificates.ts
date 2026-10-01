import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { enrollments } from './enrollments';
import { courses } from './courses';
import { users } from './users';
import { media } from './media';

// --- ENUMS ---
export const certificateStatusEnum = pgEnum('certificate_status', [
  'ACTIVE',
  'REVOKED',
]);

// --- CERTIFICATES TABLE ---
export const certificates = pgTable(
  'certificates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    certificateNumber: varchar('certificate_number', { length: 50 }).notNull(),
    enrollmentId: uuid('enrollment_id')
      .references(() => enrollments.id, { onDelete: 'restrict' })
      .notNull(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'restrict' })
      .notNull(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    studentName: varchar('student_name', { length: 200 }).notNull(),
    courseTitle: varchar('course_title', { length: 250 }).notNull(),
    instructorName: varchar('instructor_name', { length: 200 }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    finalScorePercentage: integer('final_score_percentage'),
    status: certificateStatusEnum('status').default('ACTIVE').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason'),
    pdfMediaId: uuid('pdf_media_id').references(() => media.id, { onDelete: 'set null' }),
    pdfUrl: text('pdf_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('certificates_enrollment_id_uq').on(table.enrollmentId),
    uniqueIndex('certificates_number_uq').on(table.certificateNumber),
    index('certificates_student_id_idx').on(table.studentId),
    index('certificates_course_id_idx').on(table.courseId),
    index('certificates_issued_at_idx').on(table.issuedAt),
    index('certificates_status_idx').on(table.status),
    check(
      'certificates_score_range',
      sql`"final_score_percentage" IS NULL OR ("final_score_percentage" >= 0 AND "final_score_percentage" <= 100)`
    ),
  ]
);

export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
