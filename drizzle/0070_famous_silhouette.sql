ALTER TABLE "bidder_bills" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "bidder_bills" ADD COLUMN "payout_available_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION claim_fundraising_broadcast_recipients(
  p_workspace_id text,
  p_event_id text,
  p_broadcast_id text,
  p_bidder_ids text[],
  p_channel text
)
RETURNS TABLE (bidder_id text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cooldown_minutes integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_event_id));
  SELECT greatest(1, least(60, coalesce(
    CASE WHEN auction_page->>'broadcastCooldownMinutes' ~ '^[0-9]+$' THEN (auction_page->>'broadcastCooldownMinutes')::integer END,
    3
  ))) INTO v_cooldown_minutes
  FROM events
  WHERE id = p_event_id AND workspace_id = p_workspace_id;
  v_cooldown_minutes := coalesce(v_cooldown_minutes, 3);

  RETURN QUERY
  INSERT INTO fundraising_broadcast_recipients AS inserted (
    id,
    workspace_id,
    event_id,
    broadcast_id,
    bidder_id,
    channel,
    created_at
  )
  SELECT
    'fbr_' || md5(random()::text || clock_timestamp()::text || candidate.id),
    p_workspace_id,
    p_event_id,
    p_broadcast_id,
    candidate.id,
    p_channel,
    now()
  FROM auction_bidders candidate
  WHERE candidate.workspace_id = p_workspace_id
    AND candidate.event_id = p_event_id
    AND candidate.id = ANY(p_bidder_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM fundraising_broadcast_recipients recent
      WHERE recent.event_id = p_event_id
        AND recent.bidder_id = candidate.id
        AND recent.created_at > now() - make_interval(mins => v_cooldown_minutes)
    )
  RETURNING inserted.bidder_id;
END;
$$;
