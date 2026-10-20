CREATE TABLE IF NOT EXISTS "learning_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"course_id" uuid NOT NULL,
	"module_id" uuid,
	"lesson_id" uuid,
	"event_type" varchar(50) NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_course_occurred_idx" ON "learning_events" USING btree ("course_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_user_occurred_idx" ON "learning_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_lesson_event_idx" ON "learning_events" USING btree ("lesson_id","event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_events_event_type_occurred_idx" ON "learning_events" USING btree ("event_type","occurred_at");
