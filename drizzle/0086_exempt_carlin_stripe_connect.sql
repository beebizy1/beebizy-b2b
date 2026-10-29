UPDATE "workspaces"
SET "stripe_connect_exempt" = true
WHERE "id" = (
  SELECT "workspace_id"
  FROM "events"
  WHERE "id" = 'evt_62edc65ef0fd4fb3893e'
  LIMIT 1
);
