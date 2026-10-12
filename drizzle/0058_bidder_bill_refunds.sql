ALTER TABLE "bidder_bills" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bidder_bills" ADD COLUMN "stripe_refund_id" text;