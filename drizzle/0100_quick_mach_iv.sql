CREATE TABLE "hubspot_event_sources" (
	"event_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"list_id" text NOT NULL,
	"list_name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"generation" text NOT NULL,
	"tick" integer DEFAULT 0 NOT NULL,
	"cursor" text,
	"state" text DEFAULT 'queued' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_queued_at" timestamp with time zone,
	"last_error" text,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "hubspot_event_sources" ADD CONSTRAINT "hubspot_event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_event_sources" ADD CONSTRAINT "hubspot_event_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_event_sources" ADD CONSTRAINT "hubspot_event_sources_connection_id_hubspot_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."hubspot_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hubspot_event_sources_connection_idx" ON "hubspot_event_sources" USING btree ("connection_id","enabled");