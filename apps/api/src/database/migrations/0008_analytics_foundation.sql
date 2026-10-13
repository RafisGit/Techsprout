CREATE INDEX IF NOT EXISTS "enrollments_course_enrolled_at_idx" ON "enrollments" USING btree ("course_id","enrolled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_status_enrolled_at_idx" ON "enrollments" USING btree ("status","enrolled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lesson_progress_lesson_status_idx" ON "lesson_progress" USING btree ("lesson_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_attempts_quiz_passed_idx" ON "quiz_attempts" USING btree ("quiz_id","is_passed");
