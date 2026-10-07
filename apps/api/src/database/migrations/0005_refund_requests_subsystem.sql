CREATE TYPE "public"."refund_request_reason_category" AS ENUM('COURSE_CONTENT_MISMATCH', 'TECHNICAL_ISSUES', 'ACCIDENTAL_PURCHASE', 'PERSONAL_REASONS', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."refund_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" varchar(50) NOT NULL,
	"order_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"reason_category" "refund_request_reason_category" NOT NULL,
	"reason_detail" text NOT NULL,
	"course_progress_at_request" integer NOT NULL,
	"status" "refund_request_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"admin_notes" text,
	"refund_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_requests_progress_range" CHECK ("course_progress_at_request" >= 0 AND "course_progress_at_request" <= 100),
	CONSTRAINT "refund_requests_reason_detail_min_len" CHECK (length(trim("reason_detail")) >= 10)
);
--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_request_number_uq" ON "refund_requests" USING btree ("request_number");--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_active_order_uq" ON "refund_requests" USING btree ("order_id") WHERE "status" IN ('PENDING', 'APPROVED');--> statement-breakpoint
CREATE INDEX "refund_requests_student_id_idx" ON "refund_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "refund_requests_course_id_idx" ON "refund_requests" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "refund_requests_status_idx" ON "refund_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "refund_requests_created_at_idx" ON "refund_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "refund_requests_reviewed_by_idx" ON "refund_requests" USING btree ("reviewed_by");
