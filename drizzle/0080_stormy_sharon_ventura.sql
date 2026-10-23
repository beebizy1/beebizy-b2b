CREATE TABLE "auction_outbid_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"bid_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"bidder_name" text NOT NULL,
	"event_title" text NOT NULL,
	"item_title" text NOT NULL,
	"current_bid_cents" bigint NOT NULL,
	"auction_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "auction_outbid_notifications_status_check" CHECK ("auction_outbid_notifications"."status" in ('pending', 'sent'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auction_outbid_notifications_bid_email_idx" ON "auction_outbid_notifications" USING btree ("bid_id","recipient_email");--> statement-breakpoint
CREATE INDEX "auction_outbid_notifications_due_idx" ON "auction_outbid_notifications" USING btree ("status","next_attempt_at");