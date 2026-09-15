CREATE FUNCTION "enforce_volunteer_need_capacity"() RETURNS trigger AS $$
DECLARE
  capacity_limit integer;
  filled integer;
BEGIN
  IF NEW.need_id IS NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.need_id));
  SELECT required_count INTO capacity_limit FROM volunteer_needs WHERE id = NEW.need_id;
  SELECT count(*) INTO filled
    FROM volunteer_shifts
    WHERE need_id = NEW.need_id
      AND status <> 'cancelled'
      AND id <> NEW.id;

  IF filled >= capacity_limit THEN
    RAISE EXCEPTION 'Volunteer staffing requirement is full'
      USING ERRCODE = '23514', CONSTRAINT = 'volunteer_need_capacity_check';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "volunteer_need_capacity_trigger"
  BEFORE INSERT OR UPDATE OF need_id, status ON "volunteer_shifts"
  FOR EACH ROW EXECUTE FUNCTION "enforce_volunteer_need_capacity"();--> statement-breakpoint

CREATE FUNCTION "prevent_understaffed_requirement_resize"() RETURNS trigger AS $$
DECLARE
  filled integer;
BEGIN
  IF NEW.required_count >= OLD.required_count THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.id));
  SELECT count(*) INTO filled
    FROM volunteer_shifts
    WHERE need_id = NEW.id AND status <> 'cancelled';
  IF filled > NEW.required_count THEN
    RAISE EXCEPTION 'Required volunteers cannot be lower than current staffing'
      USING ERRCODE = '23514', CONSTRAINT = 'volunteer_need_required_count_check';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "volunteer_need_resize_trigger"
  BEFORE UPDATE OF required_count ON "volunteer_needs"
  FOR EACH ROW EXECUTE FUNCTION "prevent_understaffed_requirement_resize"();
