CREATE TYPE "public"."auction_donor_status" AS ENUM('prospect', 'contacted', 'committed', 'received', 'declined');--> statement-breakpoint
CREATE TYPE "public"."auction_fulfillment_status" AS ENUM('pending', 'ready', 'picked-up', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."auction_participant_type" AS ENUM('gala', 'remote');--> statement-breakpoint
CREATE TYPE "public"."auction_readiness_status" AS ENUM('draft', 'incomplete', 'ready', 'published');--> statement-breakpoint
CREATE TYPE "public"."auction_thank_you_status" AS ENUM('pending', 'sent', 'waived');--> statement-breakpoint
CREATE TYPE "public"."invitation_delivery_status" AS ENUM('pending', 'sent', 'opened', 'registered', 'failed');--> statement-breakpoint
CREATE TABLE "auction_bidders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"participant_type" "auction_participant_type" DEFAULT 'gala' NOT NULL,
	"public_token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "auction_bidders_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "auction_bids" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"item_id" text NOT NULL,
	"bidder_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"maximum_amount_cents" bigint NOT NULL,
	"is_automatic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_donors" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"business_name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"public_token" text NOT NULL,
	"solicited_by" text,
	"solicitation_status" "auction_donor_status" DEFAULT 'prospect' NOT NULL,
	"previous_donations" text,
	"notes" text,
	"recognition_preference" text,
	"thank_you_status" "auction_thank_you_status" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "auction_donors_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "auction_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"item_id" text NOT NULL,
	"bidder_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"application_fee_cents" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "auction_orders_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"public_token" text NOT NULL,
	"status" "invitation_delivery_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"registered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ticket_invitations_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "ticket_order_guests" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "donor_id" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "restrictions" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "delivery_details" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "bid_increment_cents" bigint;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "readiness_status" "auction_readiness_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "is_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "extension_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "quantity_available" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "winning_bidder_id" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "fulfillment_status" "auction_fulfillment_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "fulfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "auction_public_token" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "auction_page" jsonb;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "application_fee_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "stripe_connected_account_id" text;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "checkout_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "stripe_refund_id" text;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "max_per_order" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "collect_guest_names" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_connected_account_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_connected_details_submitted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_connected_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_connected_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "stripe_connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD CONSTRAINT "auction_bidders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD CONSTRAINT "auction_bidders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_item_id_auction_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."auction_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_bidder_id_auction_bidders_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."auction_bidders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_donors" ADD CONSTRAINT "auction_donors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_donors" ADD CONSTRAINT "auction_donors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_orders" ADD CONSTRAINT "auction_orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_orders" ADD CONSTRAINT "auction_orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_orders" ADD CONSTRAINT "auction_orders_item_id_auction_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."auction_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_orders" ADD CONSTRAINT "auction_orders_bidder_id_auction_bidders_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."auction_bidders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_invitations" ADD CONSTRAINT "ticket_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_invitations" ADD CONSTRAINT "ticket_invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_guests" ADD CONSTRAINT "ticket_order_guests_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_guests" ADD CONSTRAINT "ticket_order_guests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_guests" ADD CONSTRAINT "ticket_order_guests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auction_bidders_event_email_idx" ON "auction_bidders" USING btree ("event_id","email");--> statement-breakpoint
CREATE INDEX "auction_bidders_event_status_idx" ON "auction_bidders" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "auction_bids_item_created_idx" ON "auction_bids" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "auction_bids_bidder_created_idx" ON "auction_bids" USING btree ("bidder_id","created_at");--> statement-breakpoint
CREATE INDEX "auction_donors_event_status_idx" ON "auction_donors" USING btree ("event_id","solicitation_status");--> statement-breakpoint
CREATE UNIQUE INDEX "auction_orders_item_bidder_idx" ON "auction_orders" USING btree ("item_id","bidder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_invitations_event_email_idx" ON "ticket_invitations" USING btree ("event_id","recipient_email");--> statement-breakpoint
CREATE INDEX "ticket_invitations_event_status_idx" ON "ticket_invitations" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "ticket_order_guests_order_idx" ON "ticket_order_guests" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "auction_items" ADD CONSTRAINT "auction_items_donor_id_auction_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."auction_donors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_auction_public_token_unique" UNIQUE("auction_public_token");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_stripe_connected_account_id_unique" UNIQUE("stripe_connected_account_id");