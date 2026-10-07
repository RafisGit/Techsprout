import { pgTable, uuid, varchar, text, integer, timestamp, uniqueIndex, index, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './users';

export const storageProviderEnum = pgEnum('storage_provider', ['CLOUDINARY', 'LOCAL', 'S3']);

export const media = pgTable(
  'media',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storageProvider: storageProviderEnum('storage_provider').default('CLOUDINARY').notNull(),
    storageKey: varchar('storage_key', { length: 255 }).notNull(),
    publicUrl: text('public_url').notNull(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    durationSeconds: integer('duration_seconds'),
    metadata: text('metadata'),
    uploaderId: uuid('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('media_storage_key_uq').on(table.storageKey),
    index('media_storage_provider_idx').on(table.storageProvider),
    index('media_uploader_id_idx').on(table.uploaderId),
  ]
);

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
