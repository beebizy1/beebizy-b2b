UPDATE "events"
SET "time_zone" = "workspaces"."time_zone"
FROM "workspaces"
WHERE "events"."workspace_id" = "workspaces"."id"
  AND "events"."time_zone" IS NULL;
