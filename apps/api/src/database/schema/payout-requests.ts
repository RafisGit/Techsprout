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
import { users } from './users';
import { instructorWallets } from './instructor-wallets';

export const payoutStatusEnum = pgEnum('payout_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SETTLED',
  'FAILED',
]);

export const payoutMethodEnum = pgEnum('payout_method', [
  'BKASH',
  'NAGAD',
  'BANK_TRANSFER',
]);

export const payoutRequests = pgTable(
  'payout_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestNumber: varchar('request_number', { length: 50 }).notNull(),
    instructorId: uuid('instructor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    walletId: uuid('wallet_id')
      .references(() => instructorWallets.id, { onDelete: 'restrict' })
      .notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    payoutMethod: payoutMethodEnum('payout_method').notNull(),
    accountDetails: text('account_details').notNull(),
    status: payoutStatusEnum('status').default('PENDING').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'restrict' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    adminNotes: text('admin_notes'),
    rejectionReason: text('rejection_reason'),
    disbursedAt: timestamp('disbursed_at', { withTimezone: true }),
    settlementReference: varchar('settlement_reference', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('payout_requests_request_number_uq').on(table.requestNumber),
    index('payout_requests_instructor_status_idx').on(table.instructorId, table.status),
    index('payout_requests_wallet_id_idx').on(table.walletId),
    index('payout_requests_status_idx').on(table.status),
    index('payout_requests_created_at_idx').on(table.createdAt),
    index('payout_requests_reviewed_by_idx').on(table.reviewedBy),
    check('payout_requests_amount_cents_positive', sql`"amount_cents" > 0`),
    check('payout_requests_currency_bdt', sql`"currency" = 'BDT'`),
    check(
      'payout_requests_settled_reference_required',
      sql`"status" != 'SETTLED' OR ("settlement_reference" IS NOT NULL AND length(trim("settlement_reference")) >= 3)`
    ),
  ]
);

export type PayoutRequest = typeof payoutRequests.$inferSelect;
export type NewPayoutRequest = typeof payoutRequests.$inferInsert;
