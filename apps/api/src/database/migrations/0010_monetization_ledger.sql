DO $$ BEGIN
 CREATE TYPE "public"."ledger_transaction_type" AS ENUM('COURSE_PURCHASE', 'ESCROW_SETTLEMENT', 'REFUND_CLAWBACK', 'PAYOUT_REQUEST', 'PAYOUT_SETTLED', 'PAYOUT_REJECTED', 'ADJUSTMENT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ledger_account_type" AS ENUM('PLATFORM_CASH', 'PLATFORM_REVENUE', 'INSTRUCTOR_PENDING', 'INSTRUCTOR_AVAILABLE', 'PAYOUT_CLEARING');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ledger_entry_direction" AS ENUM('DEBIT', 'CREDIT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payout_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'SETTLED', 'FAILED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payout_method" AS ENUM('BKASH', 'NAGAD', 'BANK_TRANSFER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instructor_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"pending_balance_cents" integer DEFAULT 0 NOT NULL,
	"payout_hold_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_earnings_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructor_wallets_balance_non_negative" CHECK ("balance_cents" >= 0),
	CONSTRAINT "instructor_wallets_pending_balance_non_negative" CHECK ("pending_balance_cents" >= 0),
	CONSTRAINT "instructor_wallets_payout_hold_non_negative" CHECK ("payout_hold_cents" >= 0),
	CONSTRAINT "instructor_wallets_lifetime_earnings_non_negative" CHECK ("lifetime_earnings_cents" >= 0),
	CONSTRAINT "instructor_wallets_currency_bdt" CHECK ("currency" = 'BDT')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_number" varchar(50) NOT NULL,
	"transaction_type" "ledger_transaction_type" NOT NULL,
	"idempotency_key" varchar(150) NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"total_amount_cents" integer NOT NULL,
	"reference_type" varchar(50) NOT NULL,
	"reference_id" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_total_amount_cents_non_negative" CHECK ("total_amount_cents" >= 0),
	CONSTRAINT "ledger_transactions_currency_bdt" CHECK ("currency" = 'BDT')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_type" "ledger_account_type" NOT NULL,
	"instructor_id" uuid,
	"wallet_id" uuid,
	"direction" "ledger_entry_direction" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"balance_after_cents" integer,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_cents_positive" CHECK ("amount_cents" > 0),
	CONSTRAINT "ledger_entries_currency_bdt" CHECK ("currency" = 'BDT')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" varchar(50) NOT NULL,
	"instructor_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"payout_method" "payout_method" NOT NULL,
	"account_details" text NOT NULL,
	"status" "payout_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"admin_notes" text,
	"rejection_reason" text,
	"disbursed_at" timestamp with time zone,
	"settlement_reference" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_requests_amount_cents_positive" CHECK ("amount_cents" > 0),
	CONSTRAINT "payout_requests_currency_bdt" CHECK ("currency" = 'BDT')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "instructor_wallets" ADD CONSTRAINT "instructor_wallets_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_instructor_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."instructor_wallets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_wallet_id_instructor_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."instructor_wallets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "instructor_wallets_instructor_id_uq" ON "instructor_wallets" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "instructor_wallets_instructor_id_idx" ON "instructor_wallets" USING btree ("instructor_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_transaction_number_uq" ON "ledger_transactions" USING btree ("transaction_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transactions_idempotency_key_uq" ON "ledger_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_type_idx" ON "ledger_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_reference_idx" ON "ledger_transactions" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_transactions_posted_at_idx" ON "ledger_transactions" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_transaction_id_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_account_type_idx" ON "ledger_entries" USING btree ("account_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_instructor_id_idx" ON "ledger_entries" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_wallet_id_idx" ON "ledger_entries" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_created_at_idx" ON "ledger_entries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payout_requests_request_number_uq" ON "payout_requests" USING btree ("request_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_requests_instructor_status_idx" ON "payout_requests" USING btree ("instructor_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_requests_wallet_id_idx" ON "payout_requests" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_requests_status_idx" ON "payout_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_requests_created_at_idx" ON "payout_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_requests_reviewed_by_idx" ON "payout_requests" USING btree ("reviewed_by");
