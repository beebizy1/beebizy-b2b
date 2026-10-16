CREATE UNIQUE INDEX "auction_bidders_event_paddle_idx"
  ON "auction_bidders" ("event_id", "paddle_number")
  WHERE "paddle_number" IS NOT NULL;

ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_fmv_nonnegative" CHECK ("fair_market_value_cents" IS NULL OR "fair_market_value_cents" >= 0);

ALTER TABLE "auction_items"
  ADD CONSTRAINT "auction_items_extended_amounts_nonnegative" CHECK (
    ("estimated_value_cents" IS NULL OR "estimated_value_cents" >= 0)
    AND ("buy_now_cents" IS NULL OR "buy_now_cents" >= 0)
    AND ("reserve_cents" IS NULL OR "reserve_cents" >= 0)
  ),
  ADD CONSTRAINT "auction_items_photo_limit" CHECK (coalesce(array_length("photo_urls", 1), 0) <= 5);

ALTER TABLE "fundraising_pledges"
  ADD CONSTRAINT "fundraising_pledges_amount_positive" CHECK ("amount_cents" > 0);

ALTER TABLE "bidder_bills"
  ADD CONSTRAINT "bidder_bills_amounts_nonnegative" CHECK (
    "items_total_cents" >= 0 AND "pledges_total_cents" >= 0 AND "fees_covered_cents" >= 0
    AND "total_cents" >= 0 AND "application_fee_cents" >= 0
  );

ALTER TABLE "fundraising_receipts"
  ADD CONSTRAINT "fundraising_receipts_amounts_nonnegative" CHECK (
    "amount_cents" >= 0 AND "fair_market_value_cents" >= 0 AND "deductible_cents" >= 0
    AND "deductible_cents" <= "amount_cents"
  );

ALTER TABLE "donations"
  ADD CONSTRAINT "donations_amount_positive" CHECK ("amount_cents" > 0),
  ADD CONSTRAINT "donations_fees_nonnegative" CHECK ("fees_covered_cents" >= 0);

CREATE OR REPLACE FUNCTION prevent_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fundraising receipts are immutable; issue a corrected receipt instead'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER fundraising_receipts_immutable_trigger
BEFORE UPDATE OR DELETE ON fundraising_receipts
FOR EACH ROW EXECUTE FUNCTION prevent_receipt_mutation();
