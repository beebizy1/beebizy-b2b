CREATE TABLE "google_calendar_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"google_email" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"calendar_summary" text,
	"refresh_token_ciphertext" text NOT NULL,
	"sync_token" text,
	"channel_id" text,
	"channel_resource_id" text,
	"channel_token_hash" text,
	"channel_expires_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "google_calendar_connections_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "google_calendar_event_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"event_id" text NOT NULL,
	"google_event_id" text NOT NULL,
	"google_etag" text,
	"google_updated_at" timestamp with time zone,
	"google_deleted_at" timestamp with time zone,
	"last_beebizy_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_links" ADD CONSTRAINT "google_calendar_event_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_links" ADD CONSTRAINT "google_calendar_event_links_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_links" ADD CONSTRAINT "google_calendar_event_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_connections_workspace_user_idx" ON "google_calendar_connections" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "google_calendar_connections_channel_idx" ON "google_calendar_connections" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "google_calendar_connections_renewal_idx" ON "google_calendar_connections" USING btree ("enabled","channel_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_event_links_connection_event_idx" ON "google_calendar_event_links" USING btree ("connection_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_calendar_event_links_connection_google_idx" ON "google_calendar_event_links" USING btree ("connection_id","google_event_id");--> statement-breakpoint
CREATE INDEX "google_calendar_event_links_workspace_event_idx" ON "google_calendar_event_links" USING btree ("workspace_id","event_id");