CREATE TABLE "hubspot_contact_inbox" (
	"connection_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"hubspot_contact_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_kind" text NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "hubspot_contact_inbox_connection_id_hubspot_contact_id_pk" PRIMARY KEY("connection_id","hubspot_contact_id")
);
--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "webhook_lease_token" text;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "webhook_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD COLUMN "webhook_last_error" text;--> statement-breakpoint
ALTER TABLE "hubspot_contact_inbox" ADD CONSTRAINT "hubspot_contact_inbox_connection_id_hubspot_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."hubspot_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_contact_inbox" ADD CONSTRAINT "hubspot_contact_inbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hubspot_inbox_workspace_idx" ON "hubspot_contact_inbox" USING btree ("workspace_id","occurred_at");