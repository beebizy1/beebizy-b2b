CREATE TABLE "event_history" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_history" ADD CONSTRAINT "event_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_history_event_created_idx" ON "event_history" USING btree ("workspace_id","event_id","created_at");--> statement-breakpoint
CREATE INDEX "event_history_learning_idx" ON "event_history" USING btree ("workspace_id","resource","created_at");--> statement-breakpoint

-- Preserve the decisions already made by design partners before append-only history existed.
INSERT INTO "event_history" ("id", "workspace_id", "event_id", "actor_id", "resource", "resource_id", "action", "summary", "before", "after", "created_at")
SELECT
	'hist_backfill_event_' || "id",
	"workspace_id",
	"id",
	'system:backfill',
	'event',
	"id",
	'created',
	'Imported existing event: ' || "title",
	NULL,
	jsonb_build_object(
		'id', "id", 'title', "title", 'description', "description", 'date', "starts_at",
		'endDate', "ends_at", 'location', "venue", 'locationId', "location_id",
		'capacity', "capacity", 'status', "status", 'category', "category", 'imageUrl', "image_url"
	),
	"created_at"
FROM "events"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "event_history" ("id", "workspace_id", "event_id", "actor_id", "resource", "resource_id", "action", "summary", "before", "after", "created_at")
SELECT
	'hist_backfill_ros_' || "id",
	"workspace_id",
	"event_id",
	'system:backfill',
	'run-of-show',
	"id",
	'created',
	'Imported run-of-show: ' || "title",
	NULL,
	jsonb_build_object(
		'id', "id", 'eventId', "event_id", 'startTime', "start_time", 'duration', "duration_minutes",
		'title', "title", 'description', "description", 'responsible', "responsible", 'sortOrder', "sort_order"
	),
	"created_at"
FROM "run_of_show_items"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "event_history" ("id", "workspace_id", "event_id", "actor_id", "resource", "resource_id", "action", "summary", "before", "after", "created_at")
SELECT
	'hist_backfill_budget_' || "id",
	"workspace_id",
	"event_id",
	'system:backfill',
	'budget',
	"id",
	'created',
	'Imported budget line: ' || "name",
	NULL,
	jsonb_build_object(
		'id', "id", 'eventId', "event_id", 'name', "name", 'category', "category", 'type', "type",
		'estimatedCents', "estimated_cents", 'actualCents', "actual_cents", 'notes', "notes", 'sortOrder', "sort_order"
	),
	"created_at"
FROM "budget_items"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "event_history" ("id", "workspace_id", "event_id", "actor_id", "resource", "resource_id", "action", "summary", "before", "after", "created_at")
SELECT
	'hist_backfill_vendor_' || ev."id",
	ev."workspace_id",
	ev."event_id",
	'system:backfill',
	'vendor-booking',
	ev."id",
	'created',
	'Imported vendor booking: ' || v."name",
	NULL,
	jsonb_build_object(
		'id', ev."id", 'eventId', ev."event_id", 'vendorId', ev."vendor_id", 'status', ev."status",
		'feeCents', ev."fee_cents", 'notes', ev."notes", 'vendorName', v."name", 'vendorCategory', v."category"
	),
	ev."created_at"
FROM "event_vendors" ev
JOIN "vendors" v ON v."id" = ev."vendor_id"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "event_history" ("id", "workspace_id", "event_id", "actor_id", "resource", "resource_id", "action", "summary", "before", "after", "created_at")
SELECT
	'hist_backfill_floorplan_' || fp."event_id",
	fp."workspace_id",
	fp."event_id",
	'system:backfill',
	'floorplan',
	fp."event_id",
	'created',
	'Imported floorplan: ' || fp."name",
	NULL,
	jsonb_build_object(
		'eventId', fp."event_id", 'name', fp."name", 'items', fp."items", 'updatedAt', fp."updated_at",
		'locationId', e."location_id", 'location', coalesce(e."venue", l."name"), 'capacity', e."capacity",
		'guestCount', (SELECT count(*) FROM "registrations" r WHERE r."event_id" = fp."event_id" AND r."status" <> 'cancelled')
	),
	fp."updated_at"
FROM "floorplans" fp
JOIN "events" e ON e."id" = fp."event_id"
LEFT JOIN "locations" l ON l."id" = e."location_id"
ON CONFLICT ("id") DO NOTHING;
