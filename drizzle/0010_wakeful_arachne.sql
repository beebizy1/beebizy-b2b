CREATE TYPE "public"."subscription_plan" AS ENUM('solo', 'team', 'enterprise');--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "subscription_plan" "subscription_plan";--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "subscription_current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "subscription_cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");