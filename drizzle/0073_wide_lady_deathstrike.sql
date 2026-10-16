CREATE TABLE "vendor_payment_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"vendor_name" text NOT NULL,
	"total_amount_cents" bigint NOT NULL,
	"balance_due_date" timestamp with time zone NOT NULL,
	"notes" text,
	CONSTRAINT "vendor_payment_plans_total_nonnegative_check" CHECK ("vendor_payment_plans"."total_amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "vendor_payment_plans" ADD CONSTRAINT "vendor_payment_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payment_plans" ADD CONSTRAINT "vendor_payment_plans_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_payment_plans_event_vendor_idx" ON "vendor_payment_plans" USING btree ("event_id","vendor_name");