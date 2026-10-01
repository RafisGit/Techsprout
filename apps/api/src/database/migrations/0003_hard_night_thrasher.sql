CREATE TYPE "public"."question_type" AS ENUM('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE');--> statement-breakpoint
CREATE TYPE "public"."quiz_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."quiz_type" AS ENUM('KNOWLEDGE_CHECK', 'FINAL_EXAM');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('IN_PROGRESS', 'SUBMITTED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."certificate_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TABLE "quiz_question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"option_text" text NOT NULL,
	"position" integer NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_question_options_position_positive" CHECK ("position" > 0)
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"question_type" "question_type" DEFAULT 'SINGLE_CHOICE' NOT NULL,
	"position" integer NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_questions_position_positive" CHECK ("position" > 0),
	CONSTRAINT "quiz_questions_points_positive" CHECK ("points" > 0)
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"quiz_type" "quiz_type" DEFAULT 'KNOWLEDGE_CHECK' NOT NULL,
	"passing_score_percentage" integer DEFAULT 70 NOT NULL,
	"max_attempts" integer DEFAULT 3,
	"time_limit_minutes" integer,
	"status" "quiz_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_position_positive" CHECK ("position" > 0),
	CONSTRAINT "quizzes_passing_score_range" CHECK ("passing_score_percentage" >= 1 AND "passing_score_percentage" <= 100),
	CONSTRAINT "quizzes_max_attempts_positive" CHECK ("max_attempts" IS NULL OR "max_attempts" > 0),
	CONSTRAINT "quizzes_time_limit_positive" CHECK ("time_limit_minutes" IS NULL OR "time_limit_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "quiz_attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option_ids" text[] NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_attempt_answers_points_awarded_non_negative" CHECK ("points_awarded" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "attempt_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"percentage" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"is_passed" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"last_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_attempts_attempt_number_positive" CHECK ("attempt_number" > 0),
	CONSTRAINT "quiz_attempts_score_non_negative" CHECK ("score" >= 0),
	CONSTRAINT "quiz_attempts_total_points_non_negative" CHECK ("total_points" >= 0),
	CONSTRAINT "quiz_attempts_percentage_range" CHECK ("percentage" >= 0 AND "percentage" <= 100)
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"certificate_number" varchar(50) NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"student_name" varchar(200) NOT NULL,
	"course_title" varchar(250) NOT NULL,
	"instructor_name" varchar(200) NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"final_score_percentage" integer,
	"status" "certificate_status" DEFAULT 'ACTIVE' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"pdf_media_id" uuid,
	"pdf_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_score_range" CHECK ("final_score_percentage" IS NULL OR ("final_score_percentage" >= 0 AND "final_score_percentage" <= 100))
);
--> statement-breakpoint
ALTER TABLE "quiz_question_options" ADD CONSTRAINT "quiz_question_options_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_pdf_media_id_media_id_fk" FOREIGN KEY ("pdf_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_question_options_q_pos_uq" ON "quiz_question_options" USING btree ("question_id","position");--> statement-breakpoint
CREATE INDEX "quiz_question_options_question_id_idx" ON "quiz_question_options" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_questions_quiz_position_uq" ON "quiz_questions" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE INDEX "quiz_questions_quiz_id_idx" ON "quiz_questions" USING btree ("quiz_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_module_position_uq" ON "quizzes" USING btree ("module_id","position");--> statement-breakpoint
CREATE INDEX "quizzes_module_id_idx" ON "quizzes" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "quizzes_status_idx" ON "quizzes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quizzes_quiz_type_idx" ON "quizzes" USING btree ("quiz_type");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempt_answers_attempt_q_uq" ON "quiz_attempt_answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE INDEX "quiz_attempt_answers_attempt_id_idx" ON "quiz_attempt_answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "quiz_attempt_answers_question_id_idx" ON "quiz_attempt_answers" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_enrollment_quiz_num_uq" ON "quiz_attempts" USING btree ("enrollment_id","quiz_id","attempt_number");--> statement-breakpoint
CREATE INDEX "quiz_attempts_enrollment_id_idx" ON "quiz_attempts" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_student_id_idx" ON "quiz_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_status_idx" ON "quiz_attempts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_enrollment_id_uq" ON "certificates" USING btree ("enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_number_uq" ON "certificates" USING btree ("certificate_number");--> statement-breakpoint
CREATE INDEX "certificates_student_id_idx" ON "certificates" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "certificates_course_id_idx" ON "certificates" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "certificates_issued_at_idx" ON "certificates" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "certificates_status_idx" ON "certificates" USING btree ("status");