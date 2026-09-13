DROP INDEX "run_of_show_event_idx";--> statement-breakpoint
ALTER TABLE "run_of_show_items" ADD COLUMN "day_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "run_of_show_event_idx" ON "run_of_show_items" USING btree ("event_id","day_number","start_time");