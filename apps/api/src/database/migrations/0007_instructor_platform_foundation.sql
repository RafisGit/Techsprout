CREATE TYPE "public"."course_review_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
ALTER TYPE "public"."course_status" ADD VALUE 'IN_REVIEW' BEFORE 'PUBLISHED';--> statement-breakpoint
CREATE TABLE "course_review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"status" "course_review_status" DEFAULT 'PENDING' NOT NULL,
	"submission_notes" text,
	"admin_feedback" text,
	"reviewed_by" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"headline" varchar(150),
	"bio" text,
	"credentials" text,
	"expertise_areas" text,
	"website_url" varchar(255),
	"linkedin_url" varchar(255),
	"github_url" varchar(255),
	"avatar_media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_review_requests" ADD CONSTRAINT "course_review_requests_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_review_requests" ADD CONSTRAINT "course_review_requests_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_review_requests" ADD CONSTRAINT "course_review_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_profiles" ADD CONSTRAINT "instructor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_profiles" ADD CONSTRAINT "instructor_profiles_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_reviews_course_id_idx" ON "course_review_requests" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_reviews_instructor_id_idx" ON "course_review_requests" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "course_reviews_status_idx" ON "course_review_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "course_reviews_course_status_idx" ON "course_review_requests" USING btree ("course_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "instructor_profiles_user_id_uq" ON "instructor_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "instructor_profiles_user_id_idx" ON "instructor_profiles" USING btree ("user_id");
