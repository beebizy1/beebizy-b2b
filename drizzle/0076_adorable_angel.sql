CREATE TABLE "member_role_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"member_name" text NOT NULL,
	"workspace_name" text NOT NULL,
	"new_role" "workspace_role" NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "member_role_notifications_status_check" CHECK ("member_role_notifications"."status" in ('pending', 'processing', 'sent'))
);
--> statement-breakpoint
ALTER TABLE "member_role_notifications" ADD CONSTRAINT "member_role_notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_role_notifications_due_idx" ON "member_role_notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "member_role_notifications_workspace_idx" ON "member_role_notifications" USING btree ("workspace_id","created_at");