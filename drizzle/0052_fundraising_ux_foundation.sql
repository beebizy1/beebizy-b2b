CREATE TYPE "public"."bidder_bill_status" AS ENUM('draft', 'pending', 'paid', 'failed', 'refunding', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."fundraising_org_type" AS ENUM('nonprofit_501c3', 'government');--> statement-breakpoint
CREATE TYPE "public"."item_submission_status" AS ENUM('submitted', 'needs_info', 'approved', 'rejected', 'in_catalog', 'sold', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."receipt_type" AS ENUM('contribution', 'quid_pro_quo', 'in_kind', 'raffle');--> statement-breakpoint
CREATE TABLE "auction_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auction_close_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"previous_closes_at" timestamp with time zone,
	"new_closes_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auction_item_winners" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"item_id" text NOT NULL,
	"bidder_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"awarded_by" text NOT NULL,
	"reversed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auction_watches" (
	"item_id" text NOT NULL,
	"bidder_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auction_watches_item_id_bidder_id_pk" PRIMARY KEY("item_id","bidder_id")
);
--> statement-breakpoint
CREATE TABLE "bidder_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"bidder_id" text NOT NULL,
	"public_token" text NOT NULL,
	"items_total_cents" bigint DEFAULT 0 NOT NULL,
	"pledges_total_cents" bigint DEFAULT 0 NOT NULL,
	"fees_covered_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"application_fee_cents" bigint DEFAULT 0 NOT NULL,
	"status" "bidder_bill_status" DEFAULT 'draft' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_connected_account_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "bidder_bills_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "bidder_bills_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "bidder_otp_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donation_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text,
	"public_token" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"goal_cents" bigint,
	"suggested_amounts_cents" bigint[] DEFAULT '{}' NOT NULL,
	"designations" text[] DEFAULT '{}' NOT NULL,
	"default_designation" text,
	"monthly_enabled" boolean DEFAULT true NOT NULL,
	"cover_fees_enabled" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "donation_campaigns_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"event_id" text,
	"household_id" text,
	"donor_name" text NOT NULL,
	"donor_email" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"frequency" text DEFAULT 'one-time' NOT NULL,
	"designation" text,
	"tribute_type" text,
	"tribute_name" text,
	"tribute_notify_email" text,
	"anonymous" boolean DEFAULT false NOT NULL,
	"employer" text,
	"fees_covered_cents" bigint DEFAULT 0 NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_subscription_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "donations_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "fundraising_broadcasts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sent_by" text NOT NULL,
	"audience_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"item_ids" text[] DEFAULT '{}' NOT NULL,
	"channels" text[] DEFAULT '{}' NOT NULL,
	"message" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fundraising_pledges" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"bidder_id" text,
	"household_id" text,
	"amount_cents" bigint NOT NULL,
	"appeal" text DEFAULT 'fund-a-need' NOT NULL,
	"designation" text,
	"channel" text DEFAULT 'remote' NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fundraising_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text,
	"household_id" text,
	"type" "receipt_type" NOT NULL,
	"receipt_number" text NOT NULL,
	"payer_name" text NOT NULL,
	"payer_email" text,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"fair_market_value_cents" bigint DEFAULT 0 NOT NULL,
	"deductible_cents" bigint DEFAULT 0 NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supersedes_receipt_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pdf_url" text
);
--> statement-breakpoint
CREATE TABLE "household_grades" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"grade" text NOT NULL,
	"school_year" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"display_name" text NOT NULL,
	"primary_email" text NOT NULL,
	"phone" text,
	"credit_name" text,
	"stripe_customer_id" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "in_kind_acknowledgments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"item_submission_id" text,
	"donor_id" text,
	"donor_name" text NOT NULL,
	"donor_email" text,
	"description" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"donor_id" text,
	"submitted_by" text NOT NULL,
	"public_token" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "item_submission_status" DEFAULT 'submitted' NOT NULL,
	"auction_item_id" text,
	"requested_changes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "item_submissions_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD COLUMN "household_id" text;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD COLUMN "attendee_id" text;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD COLUMN "paddle_number" integer;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD COLUMN "payment_method_id" text;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD COLUMN "auto_charge_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD COLUMN "checked_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD COLUMN "channel" text DEFAULT 'remote' NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_donors" ADD COLUMN "donor_kind" text DEFAULT 'family' NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_donors" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "auction_donors" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "auction_donors" ADD COLUMN "grade_tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "photo_urls" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "estimated_value_cents" bigint;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "item_submission_id" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "item_type" text DEFAULT 'silent' NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "delivery_method" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "credit_text" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "show_fair_market_value" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "buy_now_cents" bigint;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "reserve_cents" bigint;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "increment_rule" text DEFAULT 'tiered' NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "closing_wave" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "notes_to_school" text;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "is_service_or_use" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_items" ADD COLUMN "over_five_thousand_flag" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "donation_add_on_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "benefits_declined" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "fair_market_value_cents" bigint;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "benefits_description" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "ein" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "fundraising_org_type" "fundraising_org_type";--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "receipt_prefix" text DEFAULT 'BEE' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "receipt_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "raffle_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "raffle_registration_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "default_cover_fees" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auction_categories" ADD CONSTRAINT "auction_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_close_changes" ADD CONSTRAINT "auction_close_changes_item_id_auction_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."auction_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_item_winners" ADD CONSTRAINT "auction_item_winners_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_item_winners" ADD CONSTRAINT "auction_item_winners_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_item_winners" ADD CONSTRAINT "auction_item_winners_item_id_auction_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."auction_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_item_winners" ADD CONSTRAINT "auction_item_winners_bidder_id_auction_bidders_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."auction_bidders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_watches" ADD CONSTRAINT "auction_watches_item_id_auction_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."auction_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_watches" ADD CONSTRAINT "auction_watches_bidder_id_auction_bidders_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."auction_bidders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidder_bills" ADD CONSTRAINT "bidder_bills_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidder_bills" ADD CONSTRAINT "bidder_bills_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidder_bills" ADD CONSTRAINT "bidder_bills_bidder_id_auction_bidders_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."auction_bidders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidder_otp_challenges" ADD CONSTRAINT "bidder_otp_challenges_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_campaigns" ADD CONSTRAINT "donation_campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donation_campaigns" ADD CONSTRAINT "donation_campaigns_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_campaign_id_donation_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."donation_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_broadcasts" ADD CONSTRAINT "fundraising_broadcasts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_broadcasts" ADD CONSTRAINT "fundraising_broadcasts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_pledges" ADD CONSTRAINT "fundraising_pledges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_pledges" ADD CONSTRAINT "fundraising_pledges_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_pledges" ADD CONSTRAINT "fundraising_pledges_bidder_id_auction_bidders_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."auction_bidders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_pledges" ADD CONSTRAINT "fundraising_pledges_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_receipts" ADD CONSTRAINT "fundraising_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_receipts" ADD CONSTRAINT "fundraising_receipts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_receipts" ADD CONSTRAINT "fundraising_receipts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_grades" ADD CONSTRAINT "household_grades_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_grades" ADD CONSTRAINT "household_grades_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_kind_acknowledgments" ADD CONSTRAINT "in_kind_acknowledgments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_kind_acknowledgments" ADD CONSTRAINT "in_kind_acknowledgments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_kind_acknowledgments" ADD CONSTRAINT "in_kind_acknowledgments_item_submission_id_item_submissions_id_fk" FOREIGN KEY ("item_submission_id") REFERENCES "public"."item_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "in_kind_acknowledgments" ADD CONSTRAINT "in_kind_acknowledgments_donor_id_auction_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."auction_donors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_submissions" ADD CONSTRAINT "item_submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_submissions" ADD CONSTRAINT "item_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_submissions" ADD CONSTRAINT "item_submissions_donor_id_auction_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."auction_donors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_submissions" ADD CONSTRAINT "item_submissions_auction_item_id_auction_items_id_fk" FOREIGN KEY ("auction_item_id") REFERENCES "public"."auction_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auction_categories_workspace_name_idx" ON "auction_categories" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "auction_close_changes_item_idx" ON "auction_close_changes" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auction_item_winners_item_bidder_idx" ON "auction_item_winners" USING btree ("item_id","bidder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bidder_bills_event_bidder_idx" ON "bidder_bills" USING btree ("event_id","bidder_id");--> statement-breakpoint
CREATE INDEX "bidder_otp_event_phone_idx" ON "bidder_otp_challenges" USING btree ("event_id","phone","created_at");--> statement-breakpoint
CREATE INDEX "donation_campaigns_workspace_idx" ON "donation_campaigns" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "donations_campaign_idx" ON "donations" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "fundraising_broadcasts_event_idx" ON "fundraising_broadcasts" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "fundraising_pledges_event_idx" ON "fundraising_pledges" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fundraising_receipts_number_idx" ON "fundraising_receipts" USING btree ("workspace_id","receipt_number");--> statement-breakpoint
CREATE INDEX "fundraising_receipts_household_idx" ON "fundraising_receipts" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "household_grades_unique_idx" ON "household_grades" USING btree ("household_id","grade","school_year");--> statement-breakpoint
CREATE INDEX "household_grades_workspace_idx" ON "household_grades" USING btree ("workspace_id","school_year");--> statement-breakpoint
CREATE UNIQUE INDEX "households_workspace_email_idx" ON "households" USING btree ("workspace_id","primary_email");--> statement-breakpoint
CREATE INDEX "households_workspace_idx" ON "households" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "in_kind_acknowledgments_event_idx" ON "in_kind_acknowledgments" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "item_submissions_event_status_idx" ON "item_submissions" USING btree ("event_id","status");--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD CONSTRAINT "auction_bidders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bidders" ADD CONSTRAINT "auction_bidders_attendee_id_guests_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;