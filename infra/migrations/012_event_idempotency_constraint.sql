-- Migration: 012_event_idempotency_constraint.sql
-- Description: Enforce event idempotency at database level
-- Author: Claude Code
-- Created: 2024-12-14
-- Track: A2 - Database Schema & Constraints

-- Step 1: Check for existing duplicates
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT company_id, whop_event_id, COUNT(*) as cnt
    FROM events
    WHERE whop_event_id IS NOT NULL
    GROUP BY company_id, whop_event_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Found % duplicate events - keeping oldest, removing duplicates...', duplicate_count;
    
    -- Delete newer duplicates, keep oldest
    DELETE FROM events e1
    WHERE EXISTS (
      SELECT 1 FROM events e2
      WHERE e2.company_id = e1.company_id
        AND e2.whop_event_id = e1.whop_event_id
        AND e2.created_at < e1.created_at
    );
  END IF;
END $$;

-- Step 2: Create unique index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_company_whop_event_id
ON events (company_id, whop_event_id)
WHERE whop_event_id IS NOT NULL;

-- Step 3: Add index for event lookup performance
CREATE INDEX IF NOT EXISTS idx_events_whop_event_id
ON events (whop_event_id)
WHERE whop_event_id IS NOT NULL;

COMMENT ON INDEX idx_events_company_whop_event_id IS 
'Enforces idempotency: each Whop event processed once per company';
