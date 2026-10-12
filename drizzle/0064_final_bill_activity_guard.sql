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

DROP TRIGGER IF EXISTS auction_bids_final_bill_guard ON "auction_bids";
CREATE TRIGGER auction_bids_final_bill_guard
BEFORE INSERT ON "auction_bids"
FOR EACH ROW EXECUTE FUNCTION prevent_activity_after_final_bill();

DROP TRIGGER IF EXISTS fundraising_pledges_final_bill_guard ON "fundraising_pledges";
CREATE TRIGGER fundraising_pledges_final_bill_guard
BEFORE INSERT ON "fundraising_pledges"
FOR EACH ROW EXECUTE FUNCTION prevent_activity_after_final_bill();

DROP TRIGGER IF EXISTS auction_item_winners_final_bill_guard ON "auction_item_winners";
CREATE TRIGGER auction_item_winners_final_bill_guard
BEFORE INSERT ON "auction_item_winners"
FOR EACH ROW EXECUTE FUNCTION prevent_activity_after_final_bill();
