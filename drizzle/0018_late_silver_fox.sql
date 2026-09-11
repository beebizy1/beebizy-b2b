ALTER TABLE "event_quota_slots" DROP CONSTRAINT "event_quota_slots_workspace_id_calendar_year_pk";--> statement-breakpoint
ALTER TABLE "event_quota_slots" ADD COLUMN "slot" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_quota_slots" ADD CONSTRAINT "event_quota_slots_workspace_id_calendar_year_slot_pk" PRIMARY KEY("workspace_id","calendar_year","slot");--> statement-breakpoint
ALTER TABLE "event_quota_slots" ADD CONSTRAINT "event_quota_slots_slot_check" CHECK ("event_quota_slots"."slot" between 1 and 3);
