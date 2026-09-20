ALTER TABLE "rfps" ADD COLUMN "room_block_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "rooms_required" integer;--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "check_in_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "check_out_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "space_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "food_beverage_spend_cents" bigint;--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "ancillary_spend_cents" bigint;--> statement-breakpoint
ALTER TABLE "rfps" ADD COLUMN "ancillary_spend_notes" text;