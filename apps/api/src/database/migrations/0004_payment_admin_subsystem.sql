CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'PAYMENT_PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('INITIATED', 'VALIDATED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."coupon_discount_type" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT');--> statement-breakpoint
CREATE TYPE "public"."coupon_redemption_status" AS ENUM('RESERVED', 'CONSUMED', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('PAID', 'REFUNDED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED');--> statement-breakpoint
ALTER TABLE "courses" ALTER COLUMN "currency" SET DEFAULT 'BDT';--> statement-breakpoint
DROP INDEX IF EXISTS "certificates_enrollment_id_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_active_enrollment_uq" ON "certificates" USING btree ("enrollment_id") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"discount_type" "coupon_discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"min_order_amount_cents" integer DEFAULT 0 NOT NULL,
	"max_discount_amount_cents" integer,
	"course_id" uuid,
	"usage_limit" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_discount_value_positive" CHECK ("discount_value" > 0),
	CONSTRAINT "coupons_min_order_amount_non_negative" CHECK ("min_order_amount_cents" >= 0),
	CONSTRAINT "coupons_max_discount_amount_positive" CHECK ("max_discount_amount_cents" IS NULL OR "max_discount_amount_cents" > 0),
	CONSTRAINT "coupons_usage_limit_positive" CHECK ("usage_limit" IS NULL OR "usage_limit" > 0),
	CONSTRAINT "coupons_redemption_count_non_negative" CHECK ("redemption_count" >= 0),
	CONSTRAINT "coupons_per_user_limit_positive" CHECK ("per_user_limit" > 0)
);--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"payable_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"coupon_id" uuid,
	"coupon_code" varchar(50),
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_subtotal_cents_non_negative" CHECK ("subtotal_cents" >= 0),
	CONSTRAINT "orders_discount_cents_non_negative" CHECK ("discount_cents" >= 0),
	CONSTRAINT "orders_payable_cents_non_negative" CHECK ("payable_cents" >= 0),
	CONSTRAINT "orders_payable_lte_subtotal" CHECK ("payable_cents" <= "subtotal_cents")
);--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"course_title" varchar(250) NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"payable_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_unit_price_cents_non_negative" CHECK ("unit_price_cents" >= 0),
	CONSTRAINT "order_items_discount_cents_non_negative" CHECK ("discount_cents" >= 0),
	CONSTRAINT "order_items_payable_cents_non_negative" CHECK ("payable_cents" >= 0),
	CONSTRAINT "order_items_payable_lte_unit_price" CHECK ("payable_cents" <= "unit_price_cents")
);--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"merchant_tran_id" varchar(100) NOT NULL,
	"provider" varchar(50) DEFAULT 'SSLCOMMERZ' NOT NULL,
	"provider_session_key" varchar(255),
	"val_id" varchar(100),
	"bank_tran_id" varchar(100),
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"status" "payment_status" DEFAULT 'INITIATED' NOT NULL,
	"card_type" varchar(50),
	"card_brand" varchar(50),
	"gateway_fee_cents" integer,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_at" timestamp with time zone,
	"raw_response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_cents_non_negative" CHECK ("amount_cents" >= 0),
	CONSTRAINT "payments_gateway_fee_cents_non_negative" CHECK ("gateway_fee_cents" IS NULL OR "gateway_fee_cents" >= 0)
);--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "coupon_redemption_status" DEFAULT 'RESERVED' NOT NULL,
	"discount_cents" integer NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_redemptions_discount_cents_non_negative" CHECK ("discount_cents" >= 0)
);--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"order_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name" varchar(150) NOT NULL,
	"student_email" varchar(255) NOT NULL,
	"student_phone" varchar(50),
	"course_title" varchar(250) NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"payable_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"bank_tran_id" varchar(100) NOT NULL,
	"status" "invoice_status" NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_subtotal_cents_non_negative" CHECK ("subtotal_cents" >= 0),
	CONSTRAINT "invoices_discount_cents_non_negative" CHECK ("discount_cents" >= 0),
	CONSTRAINT "invoices_payable_cents_non_negative" CHECK ("payable_cents" >= 0),
	CONSTRAINT "invoices_payable_lte_subtotal" CHECK ("payable_cents" <= "subtotal_cents")
);--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_number" varchar(50) NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'PENDING' NOT NULL,
	"processed_by" uuid,
	"provider_refund_ref" varchar(100),
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_cents_non_negative" CHECK ("amount_cents" >= 0),
	CONSTRAINT "refunds_currency_bdt" CHECK ("currency" = 'BDT'),
	CONSTRAINT "refunds_reason_non_empty" CHECK (length(trim("reason")) >= 5)
);--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_uq" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_active_window_idx" ON "coupons" USING btree ("is_active","starts_at","expires_at");--> statement-breakpoint
CREATE INDEX "coupons_course_id_idx" ON "coupons" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_uq" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_student_id_status_idx" ON "orders" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_course_uq" ON "order_items" USING btree ("order_id","course_id");--> statement-breakpoint
CREATE INDEX "order_items_course_id_idx" ON "order_items" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_merchant_tran_id_uq" ON "payments" USING btree ("merchant_tran_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_val_id_uq" ON "payments" USING btree ("val_id") WHERE "val_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_order_status_idx" ON "payments" USING btree ("order_id","status");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_redemptions_order_id_uq" ON "coupon_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_user_coupon_idx" ON "coupon_redemptions" USING btree ("user_id","coupon_id");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_coupon_status_idx" ON "coupon_redemptions" USING btree ("coupon_id","status");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_order_id_idx" ON "coupon_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_uq" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_order_id_uq" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "invoices_student_id_idx" ON "invoices" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_refund_number_uq" ON "refunds" USING btree ("refund_number");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_order_id_uq" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_id_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_processed_by_idx" ON "refunds" USING btree ("processed_by");--> statement-breakpoint
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status");
