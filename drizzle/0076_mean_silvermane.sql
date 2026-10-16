CREATE TABLE "run_of_show_drafts" (
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"draft_key" text NOT NULL,
	"draft" jsonb,
	"client_updated_at" bigint NOT NULL,
	"discarded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_of_show_drafts_workspace_id_event_id_user_id_draft_key_pk" PRIMARY KEY("workspace_id","event_id","user_id","draft_key"),
	CONSTRAINT "run_of_show_drafts_key_length_check" CHECK (char_length("run_of_show_drafts"."draft_key") between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "run_of_show_drafts" ADD CONSTRAINT "run_of_show_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_of_show_drafts" ADD CONSTRAINT "run_of_show_drafts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_of_show_drafts_user_event_idx" ON "run_of_show_drafts" USING btree ("workspace_id","user_id","event_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_single_workspace_member_role_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT count(*)
    FROM old_members old_member
    JOIN new_members new_member
      ON new_member.workspace_id = old_member.workspace_id
     AND new_member.user_id = old_member.user_id
    WHERE old_member.role IS DISTINCT FROM new_member.role
  ) > 1 THEN
    RAISE EXCEPTION 'A role change may update only one workspace member at a time.' USING ERRCODE = '21000';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspace_members_single_role_update ON workspace_members;
--> statement-breakpoint
CREATE TRIGGER workspace_members_single_role_update
AFTER UPDATE ON workspace_members
REFERENCING OLD TABLE AS old_members NEW TABLE AS new_members
FOR EACH STATEMENT
EXECUTE FUNCTION guard_single_workspace_member_role_update();
