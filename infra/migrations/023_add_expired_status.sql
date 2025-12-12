-- Add expired status and supporting index for cleanup job

-- Extend status enum/check constraint to include 'expired'
ALTER TABLE recovery_cases DROP CONSTRAINT IF EXISTS recovery_cases_status_check;
ALTER TABLE recovery_cases
  ADD CONSTRAINT recovery_cases_status_check
  CHECK (status IN ('open', 'recovered', 'closed_no_recovery', 'expired'));

-- Index to support expiry scans by status and time
CREATE INDEX IF NOT EXISTS idx_cases_status_first_failure_at
  ON recovery_cases(status, first_failure_at);






