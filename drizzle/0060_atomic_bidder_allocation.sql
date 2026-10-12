CREATE OR REPLACE FUNCTION allocate_auction_bidder(
  p_workspace_id text,
  p_event_id text,
  p_name text,
  p_email text,
  p_phone text,
  p_household_id text,
  p_attendee_id text,
  p_payment_method_id text,
  p_stripe_customer_id text,
  p_auto_charge_opt_in boolean,
  p_checked_in_at timestamptz,
  p_participant_type text,
  p_public_token text,
  p_update_existing boolean
) RETURNS TABLE (id text, paddle_number integer, public_token text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing "auction_bidders"%ROWTYPE;
  v_id text;
  v_paddle integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_event_id));

  SELECT * INTO v_existing
  FROM "auction_bidders"
  WHERE "event_id" = p_event_id AND "email" = p_email
  FOR UPDATE;

  IF FOUND THEN
    IF NOT p_update_existing THEN
      RAISE EXCEPTION 'This email is already registered.' USING ERRCODE = '23505';
    END IF;
    UPDATE "auction_bidders"
    SET "name" = p_name,
        "phone" = coalesce(p_phone, "phone"),
        "household_id" = coalesce(p_household_id, "household_id"),
        "attendee_id" = coalesce(p_attendee_id, "attendee_id"),
        "payment_method_id" = coalesce(p_payment_method_id, "payment_method_id"),
        "stripe_customer_id" = coalesce(p_stripe_customer_id, "stripe_customer_id"),
        "auto_charge_opt_in" = "auto_charge_opt_in" OR p_auto_charge_opt_in,
        "checked_in_at" = coalesce(p_checked_in_at, "checked_in_at"),
        "participant_type" = p_participant_type::"auction_participant_type",
        "updated_at" = now()
    WHERE "auction_bidders"."id" = v_existing."id";
    RETURN QUERY SELECT v_existing."id", v_existing."paddle_number", v_existing."public_token";
    RETURN;
  END IF;

  SELECT coalesce(max(bidder."paddle_number"), 99) + 1 INTO v_paddle
  FROM "auction_bidders" AS bidder
  WHERE bidder."event_id" = p_event_id;
  v_id := 'abidder_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);

  INSERT INTO "auction_bidders" (
    "id", "workspace_id", "event_id", "name", "email", "phone", "household_id",
    "attendee_id", "paddle_number", "payment_method_id", "stripe_customer_id",
    "auto_charge_opt_in", "checked_in_at", "participant_type", "public_token", "sort_order"
  ) VALUES (
    v_id, p_workspace_id, p_event_id, p_name, p_email, p_phone, p_household_id,
    p_attendee_id, v_paddle, p_payment_method_id, p_stripe_customer_id,
    p_auto_charge_opt_in, p_checked_in_at, p_participant_type::"auction_participant_type", p_public_token, 0
  );

  RETURN QUERY SELECT v_id, v_paddle, p_public_token;
END;
$$;
