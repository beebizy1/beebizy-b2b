-- Renames only: an attendee is a guest, and an event's reference images are its mood
-- board. Hand-written rather than generated, because drizzle-kit cannot tell a rename from
-- a drop-and-create without asking interactively — and the answer it guesses in a
-- non-interactive shell destroys every row in both tables.
--
-- `ALTER ... RENAME` carries the data, the constraints and the indexes with it, so there is
-- nothing to back-fill. The constraint and index names are renamed explicitly because
-- Postgres does not rename them with their table, and drizzle derives the names it expects
-- from the schema — leaving them would make the very next generated migration try to drop
-- and recreate every one of these foreign keys.

ALTER TABLE "event_inspirations" RENAME TO "mood_board_images";--> statement-breakpoint
ALTER INDEX "inspirations_event_idx" RENAME TO "mood_board_images_event_idx";--> statement-breakpoint
ALTER TABLE "mood_board_images" RENAME CONSTRAINT "event_inspirations_workspace_id_workspaces_id_fk" TO "mood_board_images_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "mood_board_images" RENAME CONSTRAINT "event_inspirations_event_id_events_id_fk" TO "mood_board_images_event_id_events_id_fk";--> statement-breakpoint

ALTER TABLE "attendees" RENAME TO "guests";--> statement-breakpoint
ALTER INDEX "attendees_workspace_idx" RENAME TO "guests_workspace_idx";--> statement-breakpoint
ALTER INDEX "attendees_workspace_contact_idx" RENAME TO "guests_workspace_contact_idx";--> statement-breakpoint
ALTER TABLE "guests" RENAME CONSTRAINT "attendees_workspace_id_workspaces_id_fk" TO "guests_workspace_id_workspaces_id_fk";--> statement-breakpoint

ALTER TABLE "registrations" RENAME COLUMN "attendee_id" TO "guest_id";--> statement-breakpoint
-- This unique index is what stops one person being registered twice for the same event, so
-- its name follows the column it guards.
ALTER INDEX "registrations_event_attendee_idx" RENAME TO "registrations_event_guest_idx";--> statement-breakpoint
ALTER TABLE "registrations" RENAME CONSTRAINT "registrations_attendee_id_attendees_id_fk" TO "registrations_guest_id_guests_id_fk";
