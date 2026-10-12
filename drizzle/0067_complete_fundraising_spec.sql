CREATE TABLE "year_end_statement_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"payer_email" text NOT NULL,
	"payer_name" text NOT NULL,
	"tax_year" integer NOT NULL,
	"amount_cents" bigint DEFAULT 0 NOT NULL,
	"deductible_cents" bigint DEFAULT 0 NOT NULL,
	"receipt_count" integer DEFAULT 0 NOT NULL,
	"status" "invitation_delivery_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auction_orders" ADD COLUMN "certificate_token" text;--> statement-breakpoint
ALTER TABLE "raffle_items" ADD COLUMN "fair_market_value_cents" bigint;--> statement-breakpoint
ALTER TABLE "raffle_items" ADD COLUMN "w2g_review_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "raffle_items" ADD COLUMN "taxpayer_id_collection_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD COLUMN "fmv_zero_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "year_end_statement_deliveries" ADD CONSTRAINT "year_end_statement_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "year_end_statement_workspace_email_year_idx" ON "year_end_statement_deliveries" USING btree ("workspace_id","payer_email","tax_year");--> statement-breakpoint
ALTER TABLE "auction_orders" ADD CONSTRAINT "auction_orders_certificate_token_unique" UNIQUE("certificate_token");