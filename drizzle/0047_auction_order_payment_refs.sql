ALTER TABLE "auction_orders" ADD COLUMN "stripe_connected_account_id" text;--> statement-breakpoint
ALTER TABLE "auction_orders" ADD COLUMN "stripe_refund_id" text;