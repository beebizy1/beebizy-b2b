ALTER TABLE "raffle_items" ADD COLUMN "taxpayer_id_collected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "raffle_items" ADD COLUMN "taxpayer_id_collected_by" text;