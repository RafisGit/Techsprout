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

export const ledgerTransactionTypeEnum = pgEnum('ledger_transaction_type', [
  'COURSE_PURCHASE',
  'ESCROW_SETTLEMENT',
  'REFUND_CLAWBACK',
  'PAYOUT_REQUEST',
  'PAYOUT_SETTLED',
  'PAYOUT_REJECTED',
  'ADJUSTMENT',
]);

export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', [
  'PLATFORM_CASH',
  'PLATFORM_REVENUE',
  'INSTRUCTOR_PENDING',
  'INSTRUCTOR_AVAILABLE',
  'PAYOUT_CLEARING',
]);

export const ledgerEntryDirectionEnum = pgEnum('ledger_entry_direction', ['DEBIT', 'CREDIT']);

export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionNumber: varchar('transaction_number', { length: 50 }).notNull(),
    transactionType: ledgerTransactionTypeEnum('transaction_type').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 150 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    totalAmountCents: integer('total_amount_cents').notNull(),
    referenceType: varchar('reference_type', { length: 50 }).notNull(),
    referenceId: varchar('reference_id', { length: 100 }).notNull(),
    description: text('description').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ledger_transactions_transaction_number_uq').on(table.transactionNumber),
    uniqueIndex('ledger_transactions_idempotency_key_uq').on(table.idempotencyKey),
    index('ledger_transactions_type_idx').on(table.transactionType),
    index('ledger_transactions_reference_idx').on(table.referenceType, table.referenceId),
    index('ledger_transactions_posted_at_idx').on(table.postedAt),
    check('ledger_transactions_total_amount_cents_non_negative', sql`"total_amount_cents" >= 0`),
    check('ledger_transactions_currency_bdt', sql`"currency" = 'BDT'`),
  ]
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionId: uuid('transaction_id')
      .references(() => ledgerTransactions.id, { onDelete: 'restrict' })
      .notNull(),
    accountType: ledgerAccountTypeEnum('account_type').notNull(),
    instructorId: uuid('instructor_id').references(() => users.id, { onDelete: 'restrict' }),
    walletId: uuid('wallet_id').references(() => instructorWallets.id, { onDelete: 'restrict' }),
    direction: ledgerEntryDirectionEnum('direction').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    balanceAfterCents: integer('balance_after_cents'),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ledger_entries_transaction_id_idx').on(table.transactionId),
    index('ledger_entries_account_type_idx').on(table.accountType),
    index('ledger_entries_instructor_id_idx').on(table.instructorId),
    index('ledger_entries_wallet_id_idx').on(table.walletId),
    index('ledger_entries_created_at_idx').on(table.createdAt),
    check('ledger_entries_amount_cents_positive', sql`"amount_cents" > 0`),
    check('ledger_entries_currency_bdt', sql`"currency" = 'BDT'`),
  ]
);

export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type NewLedgerTransaction = typeof ledgerTransactions.$inferInsert;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
