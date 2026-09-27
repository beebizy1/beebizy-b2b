CREATE TYPE "public"."deposit_status" AS ENUM('pending', 'paid', 'overdue', 'refunded');--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"vendor_name" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"due_date" timestamp with time zone,
	"paid_date" timestamp with time zone,
	"paid_by" text,
	"payment_method" text,
	"status" "deposit_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	CONSTRAINT "deposits_amount_nonnegative_check" CHECK ("deposits"."amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deposits_event_due_idx" ON "deposits" USING btree ("event_id","due_date");