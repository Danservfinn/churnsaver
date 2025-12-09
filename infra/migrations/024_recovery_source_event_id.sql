-- Add recovery_source_event_id to link recoveries to source events
ALTER TABLE recovery_cases
  ADD COLUMN IF NOT EXISTS recovery_source_event_id TEXT;

-- Index for idempotent lookups by source event
CREATE INDEX IF NOT EXISTS idx_cases_recovery_source_event_id
  ON recovery_cases(recovery_source_event_id);

