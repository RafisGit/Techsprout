import { pgTable, uuid, varchar, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { media } from './media';

export const instructorProfiles = pgTable(
  'instructor_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    headline: varchar('headline', { length: 150 }),
    bio: text('bio'),
    credentials: text('credentials'),
    expertiseAreas: text('expertise_areas'),
    websiteUrl: varchar('website_url', { length: 255 }),
    linkedinUrl: varchar('linkedin_url', { length: 255 }),
    githubUrl: varchar('github_url', { length: 255 }),
    avatarMediaId: uuid('avatar_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('instructor_profiles_user_id_uq').on(table.userId),
    index('instructor_profiles_user_id_idx').on(table.userId),
  ]
);

export type InstructorProfile = typeof instructorProfiles.$inferSelect;
export type NewInstructorProfile = typeof instructorProfiles.$inferInsert;
