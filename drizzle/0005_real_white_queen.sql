-- Guest-list segments, and floorplans keyed by their own id so an event can hold more
-- than one room.
--
-- drizzle-kit's generated version of this could not be used: it emitted
-- `ADD COLUMN "id" text PRIMARY KEY NOT NULL` against a table that already has both a
-- primary key and rows, which fails twice over, and it left the old constraint drop
-- commented out for a human to fill in. The existing plan is preserved by seeding its new
-- id from the event id it used to be keyed by.

ALTER TABLE "registrations" ADD COLUMN "segment" text;--> statement-breakpoint

ALTER TABLE "floorplans" ADD COLUMN "id" text;--> statement-breakpoint
UPDATE "floorplans" SET "id" = "event_id" WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "floorplans" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "floorplans" DROP CONSTRAINT "floorplans_pkey";--> statement-breakpoint
ALTER TABLE "floorplans" ADD CONSTRAINT "floorplans_pkey" PRIMARY KEY ("id");--> statement-breakpoint

ALTER TABLE "floorplans" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "floorplans_event_idx" ON "floorplans" USING btree ("event_id");
