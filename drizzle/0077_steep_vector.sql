ALTER TABLE "member_role_notifications" DROP CONSTRAINT "member_role_notifications_status_check";--> statement-breakpoint
ALTER TABLE "member_role_notifications" ALTER COLUMN "recipient_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "member_role_notifications" ADD COLUMN "change_id" text;--> statement-breakpoint
UPDATE "member_role_notifications" SET "change_id" = "id" WHERE "change_id" IS NULL;--> statement-breakpoint
ALTER TABLE "member_role_notifications" ALTER COLUMN "change_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "email" text;--> statement-breakpoint
UPDATE "workspace_members" AS member
SET "email" = invite."email"
FROM "workspace_invites" AS invite
WHERE invite."workspace_id" = member."workspace_id"
  AND invite."accepted_user_id" = member."user_id"
  AND invite."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "member_role_notifications_change_idx" ON "member_role_notifications" USING btree ("workspace_id","user_id","change_id","new_role");--> statement-breakpoint
ALTER TABLE "member_role_notifications" ADD CONSTRAINT "member_role_notifications_status_check" CHECK ("member_role_notifications"."status" in ('pending', 'processing', 'sent', 'superseded'));
