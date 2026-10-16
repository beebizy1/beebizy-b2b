CREATE OR REPLACE FUNCTION prevent_activity_after_final_bill()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "bidder_bills"
    WHERE "event_id" = NEW."event_id" AND "bidder_id" = NEW."bidder_id"
      AND "status" IN ('pending', 'paid', 'refunding', 'refunded')
  ) THEN
    RAISE EXCEPTION 'This bidder has a finalized bidder bill.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
