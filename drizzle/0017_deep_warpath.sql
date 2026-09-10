CREATE TABLE "check_in_stations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"name" text NOT NULL,
	"lane" text NOT NULL,
	"lead" text,
	"device_count" integer DEFAULT 1 NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "check_in_stations" ADD CONSTRAINT "check_in_stations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_stations" ADD CONSTRAINT "check_in_stations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_in_stations_event_idx" ON "check_in_stations" USING btree ("event_id","sort_order");