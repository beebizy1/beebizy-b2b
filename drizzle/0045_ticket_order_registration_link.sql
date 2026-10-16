ALTER TABLE "registrations" ADD COLUMN "ticket_order_id" text;--> statement-breakpoint
CREATE INDEX "registrations_ticket_order_idx" ON "registrations" USING btree ("ticket_order_id");