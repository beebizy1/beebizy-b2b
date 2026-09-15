CREATE TABLE "volunteer_needs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"role" text NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"required_count" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"signup_open" boolean DEFAULT true NOT NULL,
	CONSTRAINT "volunteer_needs_required_count_check" CHECK ("volunteer_needs"."required_count" between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "checklist_items" ADD COLUMN "vendor_id" text;--> statement-breakpoint
ALTER TABLE "volunteer_needs" ADD CONSTRAINT "volunteer_needs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_needs" ADD CONSTRAINT "volunteer_needs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "volunteer_needs_event_idx" ON "volunteer_needs" USING btree ("event_id","start_time");--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;