-- Older rows stored the private proxy ceiling in amount_cents. Clamp the public amount
-- before bid history becomes visible so a bidder's ceiling can never leak.
UPDATE "auction_bids" AS bid
SET "amount_cents" = least(bid."amount_cents", coalesce(item."current_bid_cents", bid."amount_cents"))
FROM "auction_items" AS item
WHERE item."id" = bid."item_id";

CREATE OR REPLACE FUNCTION place_auction_bid(
  p_auction_token text,
  p_bidder_token text,
  p_item_id text,
  p_maximum_amount_cents bigint
) RETURNS TABLE (
  leader_bidder_id text,
  current_bid_cents bigint,
  minimum_next_bid_cents bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_event "events"%ROWTYPE;
  v_bidder "auction_bidders"%ROWTYPE;
  v_item "auction_items"%ROWTYPE;
  v_start bigint;
  v_increment bigint;
  v_minimum bigint;
  v_leader text;
  v_leader_max bigint;
  v_runner_max bigint;
  v_current bigint;
  v_automatic boolean;
  v_extend integer;
  v_bid_id text;
BEGIN
  SELECT * INTO v_event FROM "events"
  WHERE "auction_public_token" = p_auction_token
  FOR UPDATE;
  IF NOT FOUND OR v_event."status" = 'cancelled' THEN
    RAISE EXCEPTION 'This auction is not available.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_bidder FROM "auction_bidders"
  WHERE "public_token" = p_bidder_token AND "event_id" = v_event."id"
  FOR UPDATE;
  IF NOT FOUND OR v_bidder."status" <> 'active' THEN
    RAISE EXCEPTION 'This bidder registration is not available.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_item FROM "auction_items"
  WHERE "id" = p_item_id AND "event_id" = v_event."id"
  FOR UPDATE;
  IF NOT FOUND OR NOT v_item."is_published" THEN
    RAISE EXCEPTION 'This auction item is not available.' USING ERRCODE = '23514';
  END IF;
  IF v_item."status" <> 'open' THEN
    RAISE EXCEPTION 'Bidding is closed for this item.' USING ERRCODE = '23514';
  END IF;
  IF v_item."opens_at" IS NOT NULL AND now() < v_item."opens_at" THEN
    RAISE EXCEPTION 'Bidding is not open for this item yet.' USING ERRCODE = '23514';
  END IF;
  IF v_item."closes_at" IS NOT NULL AND now() >= v_item."closes_at" THEN
    RAISE EXCEPTION 'Bidding is closed for this item.' USING ERRCODE = '23514';
  END IF;

  v_start := COALESCE(v_item."starting_bid_cents", 0);
  v_increment := COALESCE(v_item."bid_increment_cents", 100);
  v_minimum := CASE
    WHEN v_item."current_bid_cents" IS NULL THEN v_start
    ELSE v_item."current_bid_cents" + v_increment
  END;
  IF p_maximum_amount_cents < v_minimum THEN
    RAISE EXCEPTION 'The minimum next bid is % cents.', v_minimum USING ERRCODE = '23514';
  END IF;

  v_automatic := COALESCE((v_event."auction_page" ->> 'automaticBiddingEnabled')::boolean, false)
    AND v_item."item_type" <> 'live';
  v_bid_id := 'abid_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
  INSERT INTO "auction_bids" (
    "id", "workspace_id", "event_id", "item_id", "bidder_id", "amount_cents",
    "maximum_amount_cents", "is_automatic", "channel"
  ) VALUES (
    v_bid_id,
    v_event."workspace_id", v_event."id", v_item."id", v_bidder."id",
    p_maximum_amount_cents, p_maximum_amount_cents, false,
    CASE WHEN v_item."item_type" = 'live' THEN 'live-console' ELSE 'remote' END
  );

  IF NOT v_automatic THEN
    v_leader := v_bidder."id";
    v_current := p_maximum_amount_cents;
  ELSE
    WITH bidder_maximums AS (
      SELECT "bidder_id", max("maximum_amount_cents") AS maximum,
             min("created_at") AS first_bid_at
      FROM "auction_bids"
      WHERE "item_id" = v_item."id"
      GROUP BY "bidder_id"
    ), ranked AS (
      SELECT *, row_number() OVER (ORDER BY maximum DESC, first_bid_at ASC, "bidder_id" ASC) AS rank
      FROM bidder_maximums
    )
    SELECT
      max("bidder_id") FILTER (WHERE rank = 1),
      max(maximum) FILTER (WHERE rank = 1),
      max(maximum) FILTER (WHERE rank = 2)
    INTO v_leader, v_leader_max, v_runner_max
    FROM ranked;

    v_current := CASE
      WHEN v_runner_max IS NULL THEN v_start
      ELSE least(v_leader_max, greatest(v_start, v_runner_max + v_increment))
    END;
  END IF;

  -- Store only the amount that was actually exposed to the room. The private proxy
  -- ceiling remains in maximum_amount_cents and is never returned by the public API.
  UPDATE "auction_bids"
  SET "amount_cents" = v_current,
      "is_automatic" = v_automatic AND v_current < p_maximum_amount_cents
  WHERE "id" = v_bid_id;

  v_extend := COALESCE((v_event."auction_page" ->> 'autoExtendMinutes')::integer, 0);
  UPDATE "auction_items"
  SET "current_bid_cents" = v_current,
      "winning_bidder_id" = v_leader,
      "closes_at" = CASE
        WHEN v_extend > 0
          AND "closes_at" IS NOT NULL
          AND "closes_at" <= now() + make_interval(mins => v_extend)
        THEN "closes_at" + make_interval(mins => v_extend)
        ELSE "closes_at"
      END,
      "extension_minutes" = CASE
        WHEN v_extend > 0
          AND "closes_at" IS NOT NULL
          AND "closes_at" <= now() + make_interval(mins => v_extend)
        THEN "extension_minutes" + v_extend
        ELSE "extension_minutes"
      END,
      "updated_at" = now()
  WHERE "id" = v_item."id";

  leader_bidder_id := v_leader;
  current_bid_cents := v_current;
  minimum_next_bid_cents := v_current + v_increment;
  RETURN NEXT;
END;
$$;

