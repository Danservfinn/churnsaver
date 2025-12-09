-- Rollback for 024_one_open_case_invariant

-- Drop the unique index enforcing one open case per membership
DROP INDEX IF EXISTS idx_recovery_cases_one_open_per_membership;

-- Drop merge tracking column
ALTER TABLE recovery_cases DROP COLUMN IF EXISTS merged_into_case_id;

