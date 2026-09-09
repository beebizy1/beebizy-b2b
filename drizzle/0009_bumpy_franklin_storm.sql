CREATE TYPE "public"."feedback_category" AS ENUM('general', 'bug', 'idea', 'praise');--> statement-breakpoint
CREATE TABLE "product_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" "feedback_category" DEFAULT 'general' NOT NULL,
	"message" text NOT NULL,
	"page_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_feedback_user_idx" ON "product_feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "product_feedback_workspace_idx" ON "product_feedback" USING btree ("workspace_id","created_at");