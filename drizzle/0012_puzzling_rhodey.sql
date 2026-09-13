ALTER TABLE "workspaces" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_checkout_interval" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_checkout_locked_at" timestamp with time zone;