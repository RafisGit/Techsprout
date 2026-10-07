CREATE TYPE "public"."notification_category" AS ENUM('TRANSACTIONAL', 'ACADEMIC', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('EMAIL', 'IN_APP', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('PENDING', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "uploader_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_uploader_id_idx" ON "media" USING btree ("uploader_id");--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"category" "notification_category" DEFAULT 'TRANSACTIONAL' NOT NULL,
	"action_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_is_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_user_created_at_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_order_updates" boolean DEFAULT true NOT NULL,
	"email_course_updates" boolean DEFAULT true NOT NULL,
	"email_promotions" boolean DEFAULT false NOT NULL,
	"in_app_all" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_id_uq" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid,
	"channel" "delivery_channel" NOT NULL,
	"status" "delivery_status" DEFAULT 'PENDING' NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"provider_message_id" varchar(255),
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_deliveries_created_at_idx" ON "notification_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"actor_id" uuid,
	"entity_id" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"payload" text NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_id_uq" ON "outbox_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events" USING btree ("status","created_at");
