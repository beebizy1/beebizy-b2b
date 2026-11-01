ALTER TABLE "event_vendors" ADD COLUMN "contract_signing_url" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_reminder_interval_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_next_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "paperwork_reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_analysis_status" text DEFAULT 'not-run' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_analysis_error" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "coi_analysis_model" text;