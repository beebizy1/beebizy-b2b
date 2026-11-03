DROP INDEX "event_vendors_event_idx";--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "event_vendors_event_idx" ON "event_vendors" USING btree ("event_id","sort_order");