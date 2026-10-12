CREATE OR REPLACE FUNCTION prevent_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Parent-record cascades run inside another trigger. They are legitimate retention
  -- cleanup; direct edits and direct deletes remain forbidden.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'fundraising receipts are immutable; issue a corrected receipt instead'
    USING ERRCODE = '23514';
END;
$$;
