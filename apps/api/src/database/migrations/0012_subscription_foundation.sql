DO $$ BEGIN
 CREATE TYPE "subscription_billing_interval" AS ENUM('MONTHLY', 'ANNUAL');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "subscription_status" AS ENUM('INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'EXPIRED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "mandate_status" AS ENUM('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "subscription_invoice_status" AS ENUM('PENDING', 'PAID', 'FAILED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"title" varchar(250) NOT NULL,
	"description" text,
	"billing_interval" "subscription_billing_interval" NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"trial_period_days" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_code_unique" UNIQUE("code"),
	CONSTRAINT "subscription_plans_price_cents_non_negative" CHECK ("price_cents" >= 0),
	CONSTRAINT "subscription_plans_currency_bdt" CHECK ("currency" = 'BDT'),
	CONSTRAINT "subscription_plans_trial_days_non_negative" CHECK ("trial_period_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"provider" varchar(50) DEFAULT 'SSLCOMMERZ' NOT NULL,
	"gateway_token" varchar(255) NOT NULL,
	"masked_card_number" varchar(20),
	"card_brand" varchar(50),
	"card_expiry" varchar(10),
	"status" "mandate_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_number" varchar(50) NOT NULL,
	"student_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"mandate_id" uuid,
	"status" "subscription_status" DEFAULT 'INCOMPLETE' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"dunning_attempts" integer DEFAULT 0 NOT NULL,
	"last_dunning_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_subscription_number_unique" UNIQUE("subscription_number"),
	CONSTRAINT "subscriptions_dunning_attempts_non_negative" CHECK ("dunning_attempts" >= 0),
	CONSTRAINT "subscriptions_period_valid" CHECK ("current_period_end" > "current_period_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"subscription_id" uuid NOT NULL,
	"billing_cycle_start" timestamp with time zone NOT NULL,
	"billing_cycle_end" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"status" "subscription_invoice_status" DEFAULT 'PENDING' NOT NULL,
	"payment_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "subscription_invoices_amount_non_negative" CHECK ("amount_cents" >= 0),
	CONSTRAINT "subscription_invoices_currency_bdt" CHECK ("currency" = 'BDT')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"from_status" "subscription_status" NOT NULL,
	"to_status" "subscription_status" NOT NULL,
	"reason" text,
	"actor_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_mandates" ADD CONSTRAINT "payment_mandates_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_mandate_id_payment_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."payment_mandates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_mandates_student_id_idx" ON "payment_mandates" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_mandates_status_idx" ON "payment_mandates" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_student_id_idx" ON "subscriptions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_period_end_idx" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_invoices_subscription_id_idx" ON "subscription_invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_invoices_status_idx" ON "subscription_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_status_history_subscription_id_idx" ON "subscription_status_history" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_status_history_created_at_idx" ON "subscription_status_history" USING btree ("created_at");
