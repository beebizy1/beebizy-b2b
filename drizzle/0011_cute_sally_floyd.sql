CREATE TABLE "event_quota_slots" (
	"workspace_id" text NOT NULL,
	"calendar_year" integer NOT NULL,
	"event_id" text NOT NULL,
	CONSTRAINT "event_quota_slots_workspace_id_calendar_year_pk" PRIMARY KEY("workspace_id","calendar_year")
);
--> statement-breakpoint
ALTER TABLE "event_quota_slots" ADD CONSTRAINT "event_quota_slots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_quota_slots" ADD CONSTRAINT "event_quota_slots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_quota_slots_event_idx" ON "event_quota_slots" USING btree ("event_id");