CREATE TABLE "hubspot_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"portal_id" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"access_token_ciphertext" text NOT NULL,
	"refresh_token_ciphertext" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hubspot_contact_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"guest_id" text NOT NULL,
	"hubspot_contact_id" text NOT NULL,
	"email" text NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hubspot_registration_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"registration_id" text NOT NULL,
	"hubspot_contact_id" text NOT NULL,
	"hubspot_note_id" text,
	"fingerprint" text NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "hubspot_sync_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hubspot_connections" ADD CONSTRAINT "hubspot_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_contact_links" ADD CONSTRAINT "hubspot_contact_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_contact_links" ADD CONSTRAINT "hubspot_contact_links_connection_id_hubspot_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."hubspot_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_contact_links" ADD CONSTRAINT "hubspot_contact_links_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_registration_links" ADD CONSTRAINT "hubspot_registration_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_registration_links" ADD CONSTRAINT "hubspot_registration_links_connection_id_hubspot_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."hubspot_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hubspot_registration_links" ADD CONSTRAINT "hubspot_registration_links_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_connections_workspace_idx" ON "hubspot_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "hubspot_connections_portal_idx" ON "hubspot_connections" USING btree ("portal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_contact_links_workspace_guest_idx" ON "hubspot_contact_links" USING btree ("workspace_id","guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_contact_links_connection_contact_idx" ON "hubspot_contact_links" USING btree ("connection_id","hubspot_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hubspot_registration_links_registration_idx" ON "hubspot_registration_links" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "hubspot_registration_links_connection_idx" ON "hubspot_registration_links" USING btree ("connection_id");