CREATE TABLE "hubspot_inbound_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"hubspot_contact_id" text NOT NULL,
	"guest_id" text,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text,
	"company" text,
	"phone" text,
	"email_opt_out" boolean DEFAULT false NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	"last_seen_run_id" text,
	"import_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_state" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_cursor" text;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_run_id" text;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_processed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_last_error" text;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_lease_token" text;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "inbound_last_webhook_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hubspot_inbound_contacts" ADD CONSTRAINT "hubspot_inbound_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_inbound_contacts" ADD CONSTRAINT "hubspot_inbound_contacts_connection_id_hubspot_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."hubspot_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_inbound_contacts" ADD CONSTRAINT "hubspot_inbound_contacts_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_inbound_connection_contact_idx" ON "hubspot_inbound_contacts" USING btree ("connection_id","hubspot_contact_id");--> statement-breakpoint
CREATE INDEX "hubspot_inbound_workspace_idx" ON "hubspot_inbound_contacts" USING btree ("workspace_id","archived_at");--> statement-breakpoint
CREATE INDEX "hubspot_inbound_guest_idx" ON "hubspot_inbound_contacts" USING btree ("workspace_id","guest_id");