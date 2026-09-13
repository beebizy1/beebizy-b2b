ALTER TABLE "workspaces" ADD COLUMN "event_quota_exempt" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Every workspace that exists when this runs is a pilot workspace: they were invited
-- before Beebizy published plans, and the Solo limits are not applied to them
-- retroactively. Workspaces created after this point default to false and are metered.
UPDATE "workspaces" SET "event_quota_exempt" = true;
