-- Harden events table RLS and idempotency scoping

-- Abort if any legacy rows are missing company_id to avoid silent cross-tenant data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM events WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce NOT NULL on events.company_id while NULL rows exist';
  END IF;
END
$$;

-- Enforce company scoping on events
ALTER TABLE events
  ALTER COLUMN company_id SET NOT NULL;

-- Scope idempotency to company + event id
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_whop_event_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_company_whop_event_id
  ON events (company_id, whop_event_id);

-- Tighten INSERT policy to require current company context
DROP POLICY IF EXISTS events_webhook_insert_policy ON events;
CREATE POLICY events_webhook_insert_policy ON events
  FOR INSERT
  WITH CHECK (company_id = get_current_company_id());

-- Ensure update policy also enforces tenant match (defense in depth)
DROP POLICY IF EXISTS events_company_update_policy ON events;
CREATE POLICY events_company_update_policy ON events
  FOR UPDATE
  USING (company_id = get_current_company_id());

