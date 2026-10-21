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
} from 'drizzle-orm/pg-core';
import { courses } from './courses';
import { lessons } from './lessons';
import { users } from './users';

// --- ENUMS ---
export const discussionStatusEnum = pgEnum('discussion_status', [
  'ACTIVE',
  'RESOLVED',
  'HIDDEN',
  'DELETED',
]);

export const discussionReplyStatusEnum = pgEnum('discussion_reply_status', [
  'ACTIVE',
  'HIDDEN',
  'DELETED',
]);

export const discussionVoteTargetEnum = pgEnum('discussion_vote_target', [
  'DISCUSSION',
  'REPLY',
]);

// --- DISCUSSIONS TABLE ---
export const discussions = pgTable(
  'discussions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    lessonId: uuid('lesson_id')
      .references(() => lessons.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    status: discussionStatusEnum('status').default('ACTIVE').notNull(),
    upvoteCount: integer('upvote_count').default(0).notNull(),
    replyCount: integer('reply_count').default(0).notNull(),
    isPinned: boolean('is_pinned').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('discussions_lesson_status_idx').on(table.lessonId, table.status, table.createdAt),
    index('discussions_course_id_idx').on(table.courseId),
    index('discussions_user_id_idx').on(table.userId),
  ]
);

// --- DISCUSSION REPLIES TABLE ---
export const discussionReplies = pgTable(
  'discussion_replies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    discussionId: uuid('discussion_id')
      .references(() => discussions.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    parentReplyId: uuid('parent_reply_id').references((): any => discussionReplies.id, {
      onDelete: 'cascade',
    }),
    content: text('content').notNull(),
    status: discussionReplyStatusEnum('status').default('ACTIVE').notNull(),
    upvoteCount: integer('upvote_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('discussion_replies_discussion_id_idx').on(table.discussionId, table.createdAt),
    index('discussion_replies_parent_reply_id_idx').on(table.parentReplyId),
    index('discussion_replies_user_id_idx').on(table.userId),
  ]
);

// --- DISCUSSION VOTES TABLE ---
export const discussionVotes = pgTable(
  'discussion_votes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    targetType: discussionVoteTargetEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('discussion_votes_user_target_uq').on(table.userId, table.targetType, table.targetId),
    index('discussion_votes_target_idx').on(table.targetType, table.targetId),
  ]
);

export type Discussion = typeof discussions.$inferSelect;
export type NewDiscussion = typeof discussions.$inferInsert;
export type DiscussionReply = typeof discussionReplies.$inferSelect;
export type NewDiscussionReply = typeof discussionReplies.$inferInsert;
export type DiscussionVote = typeof discussionVotes.$inferSelect;
export type NewDiscussionVote = typeof discussionVotes.$inferInsert;
