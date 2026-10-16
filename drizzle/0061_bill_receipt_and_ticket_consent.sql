ALTER TABLE "bidder_bills" ADD COLUMN "receipt_id" text;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "auto_charge_opt_in" boolean DEFAULT false NOT NULL;