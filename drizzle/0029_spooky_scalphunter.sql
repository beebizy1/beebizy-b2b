CREATE TABLE "rfp_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"rfp_id" text NOT NULL,
	"vendor_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"public_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivery_error" text,
	CONSTRAINT "rfp_invitations_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "rfp_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"rfp_id" text NOT NULL,
	"invitation_id" text,
	"vendor_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"quoted_amount_cents" bigint,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "rfp_responses_invitation_id_unique" UNIQUE("invitation_id")
);
--> statement-breakpoint
CREATE TABLE "rfps" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"target_type" text DEFAULT 'vendor' NOT NULL,
	"vendor_category" text DEFAULT 'Other' NOT NULL,
	"description" text,
	"event_type" text,
	"event_date" timestamp with time zone,
	"start_time" varchar(5),
	"end_time" varchar(5),
	"headcount" integer,
	"city" text,
	"location" text,
	"budget_min_cents" bigint,
	"budget_max_cents" bigint,
	"deadline" timestamp with time zone,
	"requirements" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "rfp_invitations" ADD CONSTRAINT "rfp_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_invitations" ADD CONSTRAINT "rfp_invitations_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_invitations" ADD CONSTRAINT "rfp_invitations_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_responses" ADD CONSTRAINT "rfp_responses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_responses" ADD CONSTRAINT "rfp_responses_rfp_id_rfps_id_fk" FOREIGN KEY ("rfp_id") REFERENCES "public"."rfps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfp_responses" ADD CONSTRAINT "rfp_responses_invitation_id_rfp_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."rfp_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfps" ADD CONSTRAINT "rfps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rfp_invitations_rfp_idx" ON "rfp_invitations" USING btree ("rfp_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rfp_invitations_rfp_vendor_idx" ON "rfp_invitations" USING btree ("rfp_id","vendor_id");--> statement-breakpoint
CREATE INDEX "rfp_responses_rfp_idx" ON "rfp_responses" USING btree ("rfp_id","created_at");--> statement-breakpoint
CREATE INDEX "rfps_event_idx" ON "rfps" USING btree ("event_id","created_at");