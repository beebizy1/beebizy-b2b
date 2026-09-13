CREATE TYPE "public"."subscription_status" AS ENUM('beta', 'active', 'past_due', 'cancelled');--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "subscription_status" "subscription_status" DEFAULT 'beta' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "beta_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "beta_ends_at" timestamp with time zone DEFAULT now() + interval '3 months' NOT NULL;