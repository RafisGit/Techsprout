CREATE TYPE "public"."storage_provider" AS ENUM('CLOUDINARY', 'LOCAL', 'S3');--> statement-breakpoint
CREATE TYPE "public"."course_level" AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS');--> statement-breakpoint
CREATE TYPE "public"."course_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."course_visibility" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "public"."lesson_type" AS ENUM('VIDEO', 'TEXT', 'PDF');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_provider" "storage_provider" DEFAULT 'CLOUDINARY' NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"public_url" text NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"duration_seconds" integer,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"instructor_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(250) NOT NULL,
	"short_description" varchar(500),
	"description" text,
	"status" "course_status" DEFAULT 'DRAFT' NOT NULL,
	"visibility" "course_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"price" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"level" "course_level" DEFAULT 'BEGINNER' NOT NULL,
	"language" varchar(50) DEFAULT 'English' NOT NULL,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	"thumbnail_media_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"lesson_type" "lesson_type" DEFAULT 'VIDEO' NOT NULL,
	"position" integer NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"is_preview" boolean DEFAULT false NOT NULL,
	"media_id" uuid,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_users_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_thumbnail_media_id_media_id_fk" FOREIGN KEY ("thumbnail_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_uq" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_is_active_idx" ON "categories" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_uq" ON "media" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "media_storage_provider_idx" ON "media" USING btree ("storage_provider");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug_uq" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "courses_category_id_idx" ON "courses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "courses_instructor_id_idx" ON "courses" USING btree ("instructor_id");--> statement-breakpoint
CREATE INDEX "courses_status_visibility_idx" ON "courses" USING btree ("status","visibility");--> statement-breakpoint
CREATE INDEX "courses_public_catalog_idx" ON "courses" USING btree ("status","visibility","created_at");--> statement-breakpoint
CREATE INDEX "courses_price_idx" ON "courses" USING btree ("price");--> statement-breakpoint
CREATE UNIQUE INDEX "modules_course_position_uq" ON "modules" USING btree ("course_id","position");--> statement-breakpoint
CREATE INDEX "modules_course_id_idx" ON "modules" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_module_position_uq" ON "lessons" USING btree ("module_id","position");--> statement-breakpoint
CREATE INDEX "lessons_module_id_idx" ON "lessons" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "lessons_is_preview_idx" ON "lessons" USING btree ("is_preview");