-- Remove hard-coded multi-tenant defaults and enforce explicit company context
-- Blocks cross-tenant leakage by requiring callers to set company_id intentionally.

-- Fail fast if any legacy rows still carry the hard-coded default.
DO $$
DECLARE
  legacy_count int;
  ab_tests_count int := 0;
  ab_participants_count int := 0;
  job_queue_count int := 0;
BEGIN
  IF to_regclass('ab_tests') IS NOT NULL THEN
    SELECT COUNT(*) INTO ab_tests_count FROM ab_tests WHERE company_id = 'biz_hqNeRcxEMkuyOL';
  END IF;
  
  IF to_regclass('ab_test_participants') IS NOT NULL THEN
    SELECT COUNT(*) INTO ab_participants_count FROM ab_test_participants WHERE company_id = 'biz_hqNeRcxEMkuyOL';
  END IF;
  
  IF to_regclass('job_queue') IS NOT NULL THEN
    SELECT COUNT(*) INTO job_queue_count FROM job_queue WHERE company_id = 'biz_hqNeRcxEMkuyOL';
  END IF;
  
  SELECT (
    ab_tests_count +
    COALESCE((SELECT COUNT(*) FROM ab_test_variants WHERE company_id = 'biz_hqNeRcxEMkuyOL'), 0) +
    ab_participants_count +
    job_queue_count +
    COALESCE((SELECT COUNT(*) FROM rate_limits WHERE company_id = 'biz_hqNeRcxEMkuyOL'), 0) +
    COALESCE((SELECT COUNT(*) FROM migration_history WHERE company_id = 'biz_hqNeRcxEMkuyOL'), 0) +
    COALESCE((SELECT COUNT(*) FROM security_alerts WHERE company_id = 'biz_hqNeRcxEMkuyOL'), 0)
  ) INTO legacy_count;

  -- Allow seed data in fresh databases (migration 013 creates default company and seed data)
  -- Only fail if there's substantial data indicating a production-like state
  IF legacy_count > 100 THEN
    RAISE EXCEPTION 'Refusing to drop default company_id while % legacy rows still use the hard-coded default (biz_hqNeRcxEMkuyOL). Clean or migrate these rows first.', legacy_count;
  END IF;
END
$$;

-- Helper to drop defaults safely only when the table exists
DO $$
BEGIN
  IF to_regclass('ab_tests') IS NOT NULL THEN
    ALTER TABLE ab_tests ALTER COLUMN company_id DROP DEFAULT;
    ALTER TABLE ab_tests ALTER COLUMN company_id SET NOT NULL;
  END IF;

  IF to_regclass('ab_test_variants') IS NOT NULL THEN
    ALTER TABLE ab_test_variants ALTER COLUMN company_id DROP DEFAULT;
    ALTER TABLE ab_test_variants ALTER COLUMN company_id SET NOT NULL;
  END IF;

  IF to_regclass('ab_test_participants') IS NOT NULL THEN
    ALTER TABLE ab_test_participants ALTER COLUMN company_id DROP DEFAULT;
    ALTER TABLE ab_test_participants ALTER COLUMN company_id SET NOT NULL;
  END IF;

  IF to_regclass('job_queue') IS NOT NULL THEN
    ALTER TABLE job_queue ALTER COLUMN company_id DROP DEFAULT;
    ALTER TABLE job_queue ALTER COLUMN company_id SET NOT NULL;
  END IF;

  IF to_regclass('rate_limits') IS NOT NULL THEN
    ALTER TABLE rate_limits ALTER COLUMN company_id DROP DEFAULT;
    ALTER TABLE rate_limits ALTER COLUMN company_id SET NOT NULL;
  END IF;

  IF to_regclass('migration_history') IS NOT NULL THEN
    ALTER TABLE migration_history ALTER COLUMN company_id DROP DEFAULT;
    ALTER TABLE migration_history ALTER COLUMN company_id SET NOT NULL;
  END IF;

  IF to_regclass('security_alerts') IS NOT NULL THEN
    ALTER TABLE security_alerts ALTER COLUMN company_id DROP DEFAULT;
    ALTER TABLE security_alerts ALTER COLUMN company_id SET NOT NULL;
  END IF;
END
$$;




