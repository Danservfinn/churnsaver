-- Migration: 011_one_open_case_constraint.sql
-- Description: Enforce single open case per company/membership
-- Author: Claude Code
-- Created: 2024-12-14
-- Track: A1 - Database Schema & Constraints

-- Step 1: Identify and resolve any existing violations
DO $$
DECLARE
  violation_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO violation_count
  FROM (
    SELECT company_id, membership_id, COUNT(*) as cnt
    FROM recovery_cases
    WHERE status = 'open'
    GROUP BY company_id, membership_id
    HAVING COUNT(*) > 1
  ) violations;
  
  IF violation_count > 0 THEN
    RAISE NOTICE 'Found % duplicate open cases - resolving...', violation_count;
    
    -- Close older duplicates, keep most recent
    UPDATE recovery_cases rc1
    SET status = 'closed_no_recovery',
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || 
                   '{"auto_closed_reason": "duplicate_open_case_migration"}'::jsonb
    WHERE status = 'open'
      AND EXISTS (
        SELECT 1 FROM recovery_cases rc2
        WHERE rc2.company_id = rc1.company_id
          AND rc2.membership_id = rc1.membership_id
          AND rc2.status = 'open'
          AND rc2.created_at > rc1.created_at
      );
  END IF;
END $$;

-- Step 2: Create partial unique index
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_one_open_case_per_membership
ON recovery_cases (company_id, membership_id)
WHERE status = 'open';

-- Step 3: Add comment for documentation
COMMENT ON INDEX idx_one_open_case_per_membership IS 
'Enforces business rule: at most one open recovery case per company/membership combination';
