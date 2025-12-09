-- Add company resolution status to events to prevent ambiguous tenant assignment
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_resolution_status') THEN
    CREATE TYPE company_resolution_status AS ENUM ('resolved', 'pending_resolution', 'failed');
  END IF;
END$$;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS company_resolution_status company_resolution_status NOT NULL DEFAULT 'resolved';

-- Backfill existing rows
UPDATE events
SET company_resolution_status = 'resolved'
WHERE company_resolution_status IS NULL;

-- Index to quickly filter unresolved events
CREATE INDEX IF NOT EXISTS idx_events_company_resolution_status
  ON events(company_resolution_status);

