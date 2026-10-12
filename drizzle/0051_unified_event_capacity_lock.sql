ALTER FUNCTION reserve_ticket_order(text, text, text, text, integer, bigint, bigint, text, timestamptz)
  RENAME TO reserve_ticket_order_with_row_lock;

CREATE FUNCTION reserve_ticket_order(
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
  v_event_id text;
BEGIN
  SELECT event_id INTO v_event_id FROM ticket_types WHERE id = p_ticket_type_id;
  IF v_event_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_event_id));
  END IF;
  PERFORM reserve_ticket_order_with_row_lock(
    p_order_id,
    p_ticket_type_id,
    p_buyer_name,
    p_buyer_email,
    p_quantity,
    p_amount_cents,
    p_application_fee_cents,
    p_connected_account_id,
    p_checkout_expires_at
  );
END;
$$;
