-- Pending Stripe sessions keep their seats until a signed expiration/failure webhook
-- releases them. A delayed success webhook can therefore never arrive after another
-- buyer has already taken the same event capacity.
CREATE OR REPLACE FUNCTION reserve_ticket_order(
  p_order_id text,
  p_ticket_type_id text,
  p_buyer_name text,
  p_buyer_email text,
  p_quantity integer,
  p_amount_cents bigint,
  p_application_fee_cents bigint,
  p_connected_account_id text,
  p_checkout_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket "ticket_types"%ROWTYPE;
  v_event "events"%ROWTYPE;
  v_pending_ticket integer;
  v_pending_event integer;
  v_registered integer;
BEGIN
  IF p_quantity < 1 THEN
    RAISE EXCEPTION 'Choose at least one ticket.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_ticket FROM "ticket_types" WHERE "id" = p_ticket_type_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That ticket type is no longer available.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_event FROM "events" WHERE "id" = v_ticket."event_id" FOR UPDATE;

  IF NOT v_ticket."is_active" THEN
    RAISE EXCEPTION '% is not on sale.', v_ticket."name" USING ERRCODE = '23514';
  END IF;
  IF p_quantity > v_ticket."max_per_order" THEN
    RAISE EXCEPTION 'You can purchase at most % at a time.', v_ticket."max_per_order" USING ERRCODE = '23514';
  END IF;
  IF p_amount_cents <> v_ticket."price_cents" * p_quantity THEN
    RAISE EXCEPTION 'The ticket total changed. Refresh and try again.' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(sum("quantity"), 0)::integer INTO v_pending_ticket
  FROM "ticket_orders"
  WHERE "ticket_type_id" = v_ticket."id" AND "status" = 'pending';

  IF v_ticket."quantity_total" > 0
     AND v_ticket."quantity_sold" + v_pending_ticket + p_quantity > v_ticket."quantity_total" THEN
    RAISE EXCEPTION 'There are not enough tickets left in this allocation.' USING ERRCODE = '23514';
  END IF;

  IF v_event."capacity" IS NOT NULL THEN
    SELECT COALESCE(sum("quantity"), 0)::integer INTO v_registered
    FROM "registrations"
    WHERE "event_id" = v_event."id" AND "status" <> 'cancelled';

    SELECT COALESCE(sum("quantity"), 0)::integer INTO v_pending_event
    FROM "ticket_orders"
    WHERE "event_id" = v_event."id" AND "status" = 'pending';

    IF v_registered + v_pending_event + p_quantity > v_event."capacity" THEN
      RAISE EXCEPTION '% is at capacity (%).', v_event."title", v_event."capacity" USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO "ticket_orders" (
    "id", "workspace_id", "event_id", "ticket_type_id", "buyer_name", "buyer_email",
    "quantity", "amount_cents", "application_fee_cents", "stripe_connected_account_id",
    "checkout_expires_at"
  ) VALUES (
    p_order_id, v_ticket."workspace_id", v_ticket."event_id", v_ticket."id", p_buyer_name,
    p_buyer_email, p_quantity, p_amount_cents, p_application_fee_cents,
    p_connected_account_id, p_checkout_expires_at
  );
END;
$$;
