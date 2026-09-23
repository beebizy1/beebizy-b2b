ALTER TABLE "workspace_invites" ADD COLUMN "event_scope_id" text;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "event_scope_id" text;--> statement-breakpoint
CREATE INDEX "workspace_invites_event_scope_idx" ON "workspace_invites" USING btree ("event_scope_id");--> statement-breakpoint
CREATE INDEX "workspace_members_event_scope_idx" ON "workspace_members" USING btree ("event_scope_id");