import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { payments } from './payments';

export const subscriptionBillingIntervalEnum = pgEnum('subscription_billing_interval', [
  'MONTHLY',
  'ANNUAL',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'INCOMPLETE',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'UNPAID',
  'EXPIRED',
]);

export const mandateStatusEnum = pgEnum('mandate_status', [
  'PENDING',
  'ACTIVE',
  'REVOKED',
  'EXPIRED',
]);

export const subscriptionInvoiceStatusEnum = pgEnum('subscription_invoice_status', [
  'PENDING',
  'PAID',
  'FAILED',
]);

// 1. Subscription Plans Catalog
export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    title: varchar('title', { length: 250 }).notNull(),
    description: text('description'),
    billingInterval: subscriptionBillingIntervalEnum('billing_interval').notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    trialPeriodDays: integer('trial_period_days').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('subscription_plans_price_cents_non_negative', sql`${table.priceCents} >= 0`),
    check('subscription_plans_currency_bdt', sql`${table.currency} = 'BDT'`),
    check('subscription_plans_trial_days_non_negative', sql`${table.trialPeriodDays} >= 0`),
  ]
);

// 2. Gateway Payment Mandates (Tokenized Card-on-File)
export const paymentMandates = pgTable(
  'payment_mandates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    provider: varchar('provider', { length: 50 }).default('SSLCOMMERZ').notNull(),
    // AES-256-GCM ciphertext only; never store or expose a raw provider token.
    gatewayTokenCiphertext: varchar('gateway_token_ciphertext', { length: 512 }).notNull(),
    maskedCardNumber: varchar('masked_card_number', { length: 20 }),
    cardBrand: varchar('card_brand', { length: 50 }),
    cardExpiry: varchar('card_expiry', { length: 10 }),
    status: mandateStatusEnum('status').default('PENDING').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('payment_mandates_student_id_idx').on(table.studentId),
    index('payment_mandates_status_idx').on(table.status),
  ]
);

// 3. Subscriptions (Core Lifecycle Record)
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionNumber: varchar('subscription_number', { length: 50 }).notNull().unique(),
    studentId: uuid('student_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    planId: uuid('plan_id')
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' })
      .notNull(),
    mandateId: uuid('mandate_id').references(() => paymentMandates.id, {
      onDelete: 'restrict',
    }),
    status: subscriptionStatusEnum('status').default('INCOMPLETE').notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    dunningAttempts: integer('dunning_attempts').default(0).notNull(),
    lastDunningAt: timestamp('last_dunning_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('subscriptions_dunning_attempts_non_negative', sql`${table.dunningAttempts} >= 0`),
    check('subscriptions_period_valid', sql`${table.currentPeriodEnd} > ${table.currentPeriodStart}`),
    index('subscriptions_student_id_idx').on(table.studentId),
    index('subscriptions_plan_id_idx').on(table.planId),
    index('subscriptions_status_idx').on(table.status),
    index('subscriptions_period_end_idx').on(table.currentPeriodEnd),
  ]
);

// 4. Subscription Renewal Invoices
export const subscriptionInvoices = pgTable(
  'subscription_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(),
    subscriptionId: uuid('subscription_id')
      .references(() => subscriptions.id, { onDelete: 'restrict' })
      .notNull(),
    billingCycleStart: timestamp('billing_cycle_start', { withTimezone: true }).notNull(),
    billingCycleEnd: timestamp('billing_cycle_end', { withTimezone: true }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: varchar('currency', { length: 3 }).default('BDT').notNull(),
    status: subscriptionInvoiceStatusEnum('status').default('PENDING').notNull(),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'restrict' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('subscription_invoices_amount_non_negative', sql`${table.amountCents} >= 0`),
    check('subscription_invoices_currency_bdt', sql`${table.currency} = 'BDT'`),
    index('subscription_invoices_subscription_id_idx').on(table.subscriptionId),
    index('subscription_invoices_status_idx').on(table.status),
  ]
);

// 5. Subscription Status History (Audit Trail)
export const subscriptionStatusHistory = pgTable(
  'subscription_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subscriptionId: uuid('subscription_id')
      .references(() => subscriptions.id, { onDelete: 'cascade' })
      .notNull(),
    fromStatus: subscriptionStatusEnum('from_status').notNull(),
    toStatus: subscriptionStatusEnum('to_status').notNull(),
    reason: text('reason'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('subscription_status_history_subscription_id_idx').on(table.subscriptionId),
    index('subscription_status_history_created_at_idx').on(table.createdAt),
  ]
);
