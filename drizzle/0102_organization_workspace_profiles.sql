CREATE TABLE "operator_drafts" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"draft" jsonb NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "operator_drafts_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "product_profile" jsonb;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "profile_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "previous_product_profile" jsonb;