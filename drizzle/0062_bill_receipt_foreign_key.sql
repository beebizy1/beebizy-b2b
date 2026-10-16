ALTER TABLE "bidder_bills"
  ADD CONSTRAINT "bidder_bills_receipt_id_fundraising_receipts_id_fk"
  FOREIGN KEY ("receipt_id") REFERENCES "public"."fundraising_receipts"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE OR REPLACE FUNCTION record_live_auction_sale_atomic(
  p_workspace_id text,
  p_event_id text,
  p_item_id text,
  p_paddle_numbers integer[],
  p_amount_cents bigint,
  p_awarded_by text
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_item "auction_items"%ROWTYPE;
  v_bidder_count integer;
  v_winner_names text;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_item FROM "auction_items"
  WHERE "id" = p_item_id AND "event_id" = p_event_id AND "workspace_id" = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That live auction item no longer exists.' USING ERRCODE = '23514'; END IF;
  IF v_item."status" <> 'open' THEN RAISE EXCEPTION 'This live auction item has already been settled.' USING ERRCODE = '23514'; END IF;
  IF v_item."item_type" <> 'live' AND v_item."auction_type" <> 'live' THEN RAISE EXCEPTION 'Only a live auction item can be recorded from the console.' USING ERRCODE = '23514'; END IF;
  IF cardinality(p_paddle_numbers) < 1 OR cardinality(p_paddle_numbers) > v_item."quantity_available" THEN
    RAISE EXCEPTION 'The winner count is outside this lot quantity.' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), string_agg("name", ', ' ORDER BY "paddle_number") INTO v_bidder_count, v_winner_names
  FROM "auction_bidders"
  WHERE "event_id" = p_event_id AND "paddle_number" = ANY(p_paddle_numbers) AND "status" = 'active';
  IF v_bidder_count <> cardinality(p_paddle_numbers) THEN RAISE EXCEPTION 'One or more paddle numbers are not active.' USING ERRCODE = '23514'; END IF;

  UPDATE "auction_items" SET "status" = 'won', "current_bid_cents" = p_amount_cents,
    "winning_bidder_id" = (SELECT "id" FROM "auction_bidders" WHERE "event_id" = p_event_id AND "paddle_number" = p_paddle_numbers[1]),
    "winner_name" = v_winner_names, "updated_at" = v_now
  WHERE "id" = p_item_id;

  INSERT INTO "auction_item_winners" ("id", "workspace_id", "event_id", "item_id", "bidder_id", "amount_cents", "awarded_by")
  SELECT 'winner_' || substr(md5(random()::text || clock_timestamp()::text || bidder."id"), 1, 24),
    p_workspace_id, p_event_id, p_item_id, bidder."id", p_amount_cents, p_awarded_by
  FROM "auction_bidders" AS bidder
  WHERE bidder."event_id" = p_event_id AND bidder."paddle_number" = ANY(p_paddle_numbers);

  INSERT INTO "auction_orders" ("id", "workspace_id", "event_id", "item_id", "bidder_id", "amount_cents", "application_fee_cents", "status")
  SELECT 'aord_' || substr(md5(random()::text || clock_timestamp()::text || bidder."id"), 1, 24),
    p_workspace_id, p_event_id, p_item_id, bidder."id", p_amount_cents, round(p_amount_cents * 0.02)::bigint, 'pending'
  FROM "auction_bidders" AS bidder
  WHERE bidder."event_id" = p_event_id AND bidder."paddle_number" = ANY(p_paddle_numbers);
  RETURN v_bidder_count;
END;
$$;

CREATE OR REPLACE FUNCTION purchase_auction_item_buy_now(
  p_auction_token text,
  p_bidder_token text,
  p_item_id text
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_event "events"%ROWTYPE;
  v_bidder "auction_bidders"%ROWTYPE;
  v_item "auction_items"%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_event FROM "events" WHERE "auction_public_token" = p_auction_token;
  SELECT * INTO v_bidder FROM "auction_bidders" WHERE "public_token" = p_bidder_token AND "event_id" = v_event."id";
  IF NOT FOUND OR v_bidder."payment_method_id" IS NULL THEN RAISE EXCEPTION 'Add a card or wallet before buying this item.' USING ERRCODE = '23514'; END IF;
  SELECT * INTO v_item FROM "auction_items" WHERE "id" = p_item_id AND "event_id" = v_event."id" FOR UPDATE;
  IF NOT FOUND OR v_item."status" <> 'open' OR NOT v_item."is_published" OR v_item."buy_now_cents" IS NULL THEN
    RAISE EXCEPTION 'This buy-it-now item is no longer available.' USING ERRCODE = '23514';
  END IF;
  UPDATE "auction_items" SET "status" = 'won', "winning_bidder_id" = v_bidder."id", "winner_name" = v_bidder."name",
    "current_bid_cents" = v_item."buy_now_cents", "updated_at" = v_now WHERE "id" = v_item."id";
  INSERT INTO "auction_item_winners" ("id", "workspace_id", "event_id", "item_id", "bidder_id", "amount_cents", "awarded_by")
  VALUES ('winner_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), v_item."workspace_id", v_item."event_id", v_item."id", v_bidder."id", v_item."buy_now_cents", 'buy-now');
  INSERT INTO "auction_orders" ("id", "workspace_id", "event_id", "item_id", "bidder_id", "amount_cents", "application_fee_cents", "status")
  VALUES ('aord_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24), v_item."workspace_id", v_item."event_id", v_item."id", v_bidder."id", v_item."buy_now_cents", round(v_item."buy_now_cents" * 0.02)::bigint, 'pending');
  RETURN v_item."buy_now_cents";
END;
$$;

CREATE OR REPLACE FUNCTION prevent_activity_after_final_bill()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id text;
  v_bidder_id text;
BEGIN
  v_event_id := NEW."event_id";
  v_bidder_id := NEW."bidder_id";
  IF EXISTS (
    SELECT 1 FROM "bidder_bills"
    WHERE "event_id" = v_event_id AND "bidder_id" = v_bidder_id
      AND "status" IN ('paid', 'refunding', 'refunded')
  ) THEN
    RAISE EXCEPTION 'This bidder has a finalized bidder bill.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auction_bids_final_bill_guard
BEFORE INSERT ON "auction_bids"
FOR EACH ROW EXECUTE FUNCTION prevent_activity_after_final_bill();

CREATE TRIGGER fundraising_pledges_final_bill_guard
BEFORE INSERT ON "fundraising_pledges"
FOR EACH ROW EXECUTE FUNCTION prevent_activity_after_final_bill();

CREATE TRIGGER auction_item_winners_final_bill_guard
BEFORE INSERT ON "auction_item_winners"
FOR EACH ROW EXECUTE FUNCTION prevent_activity_after_final_bill();
