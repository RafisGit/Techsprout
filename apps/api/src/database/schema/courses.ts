import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { categories } from './categories';
import { media } from './media';

export const courseStatusEnum = pgEnum('course_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const courseVisibilityEnum = pgEnum('course_visibility', ['PUBLIC', 'PRIVATE']);
export const courseLevelEnum = pgEnum('course_level', [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
  'ALL_LEVELS',
]);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    instructorId: uuid('instructor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 250 }).notNull(),
    shortDescription: varchar('short_description', { length: 500 }),
    description: text('description'),
    status: courseStatusEnum('status').default('DRAFT').notNull(),
    visibility: courseVisibilityEnum('visibility').default('PUBLIC').notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).default('0.00').notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    level: courseLevelEnum('level').default('BEGINNER').notNull(),
    language: varchar('language', { length: 50 }).default('English').notNull(),
    durationMinutes: integer('duration_minutes').default(0).notNull(),
    thumbnailMediaId: uuid('thumbnail_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('courses_slug_uq').on(table.slug),
    index('courses_category_id_idx').on(table.categoryId),
    index('courses_instructor_id_idx').on(table.instructorId),
    index('courses_status_visibility_idx').on(table.status, table.visibility),
    index('courses_public_catalog_idx').on(table.status, table.visibility, table.createdAt),
    index('courses_price_idx').on(table.price),
  ]
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
