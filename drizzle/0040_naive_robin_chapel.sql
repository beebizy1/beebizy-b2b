ALTER TABLE "registrations" ADD CONSTRAINT "registrations_quantity_range" CHECK ("registrations"."quantity" between 1 and 10000);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_event_registration_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  max_capacity integer;
  current_total bigint;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.event_id = OLD.event_id
     AND (CASE WHEN NEW.status = 'cancelled' THEN 0 ELSE NEW.quantity END)
         <= (CASE WHEN OLD.status = 'cancelled' THEN 0 ELSE OLD.quantity END) THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.event_id));
  SELECT capacity INTO max_capacity FROM events WHERE id = NEW.event_id;
  IF max_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(quantity), 0)
    INTO current_total
    FROM registrations
   WHERE event_id = NEW.event_id
     AND status <> 'cancelled'
     AND id <> NEW.id;

  IF current_total + NEW.quantity > max_capacity THEN
    RAISE EXCEPTION 'event capacity exceeded'
      USING ERRCODE = '23514', CONSTRAINT = 'registrations_event_capacity_check';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER registrations_event_capacity_trigger
BEFORE INSERT OR UPDATE OF event_id, status, quantity ON registrations
FOR EACH ROW EXECUTE FUNCTION enforce_event_registration_capacity();
