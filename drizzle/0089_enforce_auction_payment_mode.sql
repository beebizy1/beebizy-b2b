CREATE OR REPLACE FUNCTION purchase_auction_item_buy_now(
  p_auction_token text,
  p_bidder_token text,
  p_item_id text
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_event "events"%ROWTYPE;
  v_workspace "workspaces"%ROWTYPE;
  v_bidder "auction_bidders"%ROWTYPE;
  v_item "auction_items"%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_event FROM "events" WHERE "auction_public_token" = p_auction_token;
  SELECT * INTO v_workspace FROM "workspaces" WHERE "id" = v_event."workspace_id";
  SELECT * INTO v_bidder FROM "auction_bidders" WHERE "public_token" = p_bidder_token AND "event_id" = v_event."id";
  IF NOT FOUND OR (
    NOT v_event."auction_pay_later"
    AND (v_bidder."payment_method_id" IS NULL OR v_workspace."stripe_connected_account_id" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Add a card or wallet before buying this item.' USING ERRCODE = '23514';
  END IF;
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
