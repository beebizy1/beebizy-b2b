CREATE TABLE "floorplan_share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"floorplan_id" text NOT NULL,
	"public_token" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floorplan_share_links_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
ALTER TABLE "floorplan_share_links" ADD CONSTRAINT "floorplan_share_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorplan_share_links" ADD CONSTRAINT "floorplan_share_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floorplan_share_links" ADD CONSTRAINT "floorplan_share_links_floorplan_id_floorplans_id_fk" FOREIGN KEY ("floorplan_id") REFERENCES "public"."floorplans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "floorplan_share_links_floorplan_idx" ON "floorplan_share_links" USING btree ("floorplan_id");--> statement-breakpoint
CREATE INDEX "floorplan_share_links_event_idx" ON "floorplan_share_links" USING btree ("workspace_id","event_id");