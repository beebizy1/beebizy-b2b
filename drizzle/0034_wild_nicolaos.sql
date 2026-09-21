ALTER TABLE "run_of_show_items" ADD COLUMN "assigned_email" text;--> statement-breakpoint
ALTER TABLE "run_of_show_items" ADD COLUMN "completed" boolean DEFAULT false NOT NULL;