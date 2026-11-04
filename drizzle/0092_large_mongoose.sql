ALTER TABLE "event_vendors" ADD COLUMN "client_charge_cents" bigint;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD COLUMN "service_time" text;--> statement-breakpoint
ALTER TABLE "event_vendors" ADD CONSTRAINT "event_vendors_fee_nonnegative_check" CHECK ("event_vendors"."fee_cents" is null or "event_vendors"."fee_cents" >= 0);--> statement-breakpoint
ALTER TABLE "event_vendors" ADD CONSTRAINT "event_vendors_client_charge_nonnegative_check" CHECK ("event_vendors"."client_charge_cents" is null or "event_vendors"."client_charge_cents" >= 0);