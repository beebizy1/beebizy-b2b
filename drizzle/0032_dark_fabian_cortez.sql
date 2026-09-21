DROP INDEX "volunteer_needs_event_idx";--> statement-breakpoint
DROP INDEX "volunteer_shifts_event_idx";--> statement-breakpoint
ALTER TABLE "volunteer_needs" ADD COLUMN "day_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "volunteer_shifts" ADD COLUMN "day_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "volunteer_needs_event_idx" ON "volunteer_needs" USING btree ("event_id","day_number","start_time");--> statement-breakpoint
CREATE INDEX "volunteer_shifts_event_idx" ON "volunteer_shifts" USING btree ("event_id","day_number","start_time");