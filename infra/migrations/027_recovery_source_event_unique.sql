-- Prevent double-recovery attribution via UNIQUE partial index
-- This is the primary protection against TOCTOU race conditions
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_recovery_source_event_id_unique
  ON recovery_cases(company_id, recovery_source_event_id)
  WHERE recovery_source_event_id IS NOT NULL;

