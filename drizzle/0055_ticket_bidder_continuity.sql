ALTER TABLE "ticket_orders" ADD COLUMN "buyer_phone" text;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "grade_tags" text[] DEFAULT '{}' NOT NULL;