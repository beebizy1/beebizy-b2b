CREATE OR REPLACE FUNCTION normalize_vendor_payment_plan_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.vendor_key := lower(trim(NEW.vendor_name));
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER vendor_payment_plans_normalize_key
BEFORE INSERT OR UPDATE OF vendor_name ON vendor_payment_plans
FOR EACH ROW EXECUTE FUNCTION normalize_vendor_payment_plan_key();--> statement-breakpoint

CREATE OR REPLACE FUNCTION guard_vendor_paid_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  contracted_cents bigint;
  other_paid_cents bigint;
BEGIN
  IF NEW.payment_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.payment_plan_id));
  SELECT total_amount_cents INTO contracted_cents
  FROM vendor_payment_plans
  WHERE id = NEW.payment_plan_id
    AND event_id = NEW.event_id
    AND workspace_id = NEW.workspace_id
  FOR UPDATE;

  IF contracted_cents IS NULL THEN
    RAISE EXCEPTION 'That vendor payment plan does not belong to this event.' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(sum(amount_cents), 0) INTO other_paid_cents
  FROM deposits
  WHERE payment_plan_id = NEW.payment_plan_id
    AND status = 'paid'
    AND id <> NEW.id;

  IF other_paid_cents + (CASE WHEN NEW.status = 'paid' THEN NEW.amount_cents ELSE 0 END) > contracted_cents THEN
    RAISE EXCEPTION 'Paid deposits cannot be greater than the total vendor cost.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER deposits_guard_paid_total
BEFORE INSERT OR UPDATE OF payment_plan_id, amount_cents, status ON deposits
FOR EACH ROW EXECUTE FUNCTION guard_vendor_paid_total();--> statement-breakpoint

CREATE OR REPLACE FUNCTION guard_vendor_plan_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  paid_cents bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.id));
  SELECT coalesce(sum(amount_cents), 0) INTO paid_cents
  FROM deposits
  WHERE payment_plan_id = NEW.id AND status = 'paid';

  IF paid_cents > NEW.total_amount_cents THEN
    RAISE EXCEPTION 'The total vendor cost cannot be less than deposits already paid.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER vendor_payment_plans_guard_total
BEFORE UPDATE OF total_amount_cents ON vendor_payment_plans
FOR EACH ROW EXECUTE FUNCTION guard_vendor_plan_total();
