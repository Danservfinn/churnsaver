-- One open case per membership invariant (cleanup + enforcement)

-- Audit existing duplicates before cleanup
SELECT company_id, membership_id, COUNT(*) AS open_case_count
FROM recovery_cases
WHERE status = 'open'
GROUP BY company_id, membership_id
HAVING COUNT(*) > 1;

-- Add column for merge tracking (idempotent)
ALTER TABLE recovery_cases
  ADD COLUMN IF NOT EXISTS merged_into_case_id TEXT REFERENCES recovery_cases(id);

-- Deterministically close duplicate open cases, keeping the most recent failure
WITH ranked AS (
  SELECT
    id,
    company_id,
    membership_id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id, membership_id
      ORDER BY first_failure_at DESC, created_at DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY company_id, membership_id
      ORDER BY first_failure_at DESC, created_at DESC, id DESC
    ) AS canonical_id
  FROM recovery_cases
  WHERE status = 'open'
),
to_close AS (
  SELECT id, canonical_id FROM ranked WHERE rn > 1
)
UPDATE recovery_cases rc
SET
  status = 'closed_no_recovery',
  merged_into_case_id = to_close.canonical_id,
  updated_at = NOW()
FROM to_close
WHERE rc.id = to_close.id;

-- Note: This will briefly lock recovery_cases; run during a low-traffic window.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_cases_one_open_per_membership
  ON recovery_cases (company_id, membership_id)
  WHERE status = 'open';

