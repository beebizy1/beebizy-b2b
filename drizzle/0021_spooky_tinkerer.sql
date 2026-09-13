CREATE TYPE "public"."workspace_experience" AS ENUM('standard', 'santa-clara');--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "experience" "workspace_experience" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
UPDATE "workspaces"
SET "experience" = 'santa-clara'
WHERE "id" IN (
	SELECT "workspace_id"
	FROM "workspace_invites"
	WHERE lower("email") IN ('ccismasflorea@scu.edu', 'poorvi@santaclaraventures.com')
);
