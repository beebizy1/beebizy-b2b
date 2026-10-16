ALTER TABLE "bidder_bills" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bidder_bills" ADD COLUMN "checkout_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "grade_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "subscription_ended_at" timestamp with time zone;