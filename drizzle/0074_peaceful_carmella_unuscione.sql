DROP INDEX "vendor_payment_plans_event_vendor_idx";--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "payment_plan_id" text;--> statement-breakpoint
ALTER TABLE "vendor_payment_plans" ADD COLUMN "vendor_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_payment_plan_id_vendor_payment_plans_id_fk" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."vendor_payment_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deposits_payment_plan_idx" ON "deposits" USING btree ("payment_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_payment_plans_event_vendor_idx" ON "vendor_payment_plans" USING btree ("event_id","vendor_key");