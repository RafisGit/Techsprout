import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const instructorWallets = pgTable(
  'instructor_wallets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    instructorId: uuid('instructor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    balanceCents: integer('balance_cents').default(0).notNull(),
    pendingBalanceCents: integer('pending_balance_cents').default(0).notNull(),
    payoutHoldCents: integer('payout_hold_cents').default(0).notNull(),
    lifetimeEarningsCents: integer('lifetime_earnings_cents').default(0).notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('instructor_wallets_instructor_id_uq').on(table.instructorId),
    index('instructor_wallets_instructor_id_idx').on(table.instructorId),
    check('instructor_wallets_balance_non_negative', sql`"balance_cents" >= 0`),
    check('instructor_wallets_pending_balance_non_negative', sql`"pending_balance_cents" >= 0`),
    check('instructor_wallets_payout_hold_non_negative', sql`"payout_hold_cents" >= 0`),
    check('instructor_wallets_lifetime_earnings_non_negative', sql`"lifetime_earnings_cents" >= 0`),
    check('instructor_wallets_currency_bdt', sql`"currency" = 'BDT'`),
  ]
);

export type InstructorWallet = typeof instructorWallets.$inferSelect;
export type NewInstructorWallet = typeof instructorWallets.$inferInsert;
