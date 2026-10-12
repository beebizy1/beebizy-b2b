CREATE TABLE "fundraising_broadcast_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"broadcast_id" text NOT NULL,
	"bidder_id" text NOT NULL,
	"channel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "year_end_statement_workspace_email_year_idx";--> statement-breakpoint
ALTER TABLE "year_end_statement_deliveries" ADD COLUMN "household_id" text;--> statement-breakpoint
ALTER TABLE "fundraising_broadcast_recipients" ADD CONSTRAINT "fundraising_broadcast_recipients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_broadcast_recipients" ADD CONSTRAINT "fundraising_broadcast_recipients_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_broadcast_recipients" ADD CONSTRAINT "fundraising_broadcast_recipients_broadcast_id_fundraising_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."fundraising_broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundraising_broadcast_recipients" ADD CONSTRAINT "fundraising_broadcast_recipients_bidder_id_auction_bidders_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."auction_bidders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fundraising_broadcast_recipient_cooldown_idx" ON "fundraising_broadcast_recipients" USING btree ("event_id","bidder_id","created_at");--> statement-breakpoint
ALTER TABLE "year_end_statement_deliveries" ADD CONSTRAINT "year_end_statement_deliveries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "year_end_statement_household_year_idx" ON "year_end_statement_deliveries" USING btree ("workspace_id","household_id","tax_year") WHERE "year_end_statement_deliveries"."household_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "year_end_statement_email_year_idx" ON "year_end_statement_deliveries" USING btree ("workspace_id","payer_email","tax_year") WHERE "year_end_statement_deliveries"."household_id" is null;--> statement-breakpoint
CREATE OR REPLACE FUNCTION claim_fundraising_broadcast_recipients(
  p_workspace_id text,
  p_event_id text,
  p_broadcast_id text,
  p_bidder_ids text[],
  p_channel text
)
RETURNS TABLE (bidder_id text)
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_event_id));

  RETURN QUERY
  INSERT INTO fundraising_broadcast_recipients AS inserted (
    id,
    workspace_id,
    event_id,
    broadcast_id,
    bidder_id,
    channel,
    created_at
  )
  SELECT
    'fbr_' || md5(random()::text || clock_timestamp()::text || candidate.id),
    p_workspace_id,
    p_event_id,
    p_broadcast_id,
    candidate.id,
    p_channel,
    now()
  FROM auction_bidders candidate
  WHERE candidate.workspace_id = p_workspace_id
    AND candidate.event_id = p_event_id
    AND candidate.id = ANY(p_bidder_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM fundraising_broadcast_recipients recent
      WHERE recent.event_id = p_event_id
        AND recent.bidder_id = candidate.id
        AND recent.created_at > now() - interval '3 minutes'
    )
  RETURNING inserted.bidder_id;
END;
$$;
