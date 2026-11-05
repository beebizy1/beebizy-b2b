CREATE TABLE "google_calendar_external_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"google_event_id" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"time_zone" text,
	"location" text,
	"is_all_day" boolean DEFAULT false NOT NULL,
	"html_link" text,
	"google_etag" text,
	"google_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "external_backfill_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "google_calendar_external_events" ADD CONSTRAINT "google_calendar_external_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_external_events" ADD CONSTRAINT "google_calendar_external_events_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_external_events_connection_google_idx" ON "google_calendar_external_events" USING btree ("connection_id","google_event_id");--> statement-breakpoint
CREATE INDEX "google_calendar_external_events_user_range_idx" ON "google_calendar_external_events" USING btree ("workspace_id","user_id","starts_at");