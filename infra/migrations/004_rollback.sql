-- Churn Saver Database Schema Rollback
-- Rollback: 004_rollback.sql
-- Reverses migration: 004_add_ab_testing.sql

-- WARNING: This will permanently delete all A/B testing data
-- Consider backing up critical A/B test data before proceeding

-- Drop performance view first
DROP VIEW IF EXISTS ab_test_performance;

-- Drop helper function
DROP FUNCTION IF EXISTS get_best_ab_variant(text);

-- Drop RLS policies first (idempotent)
DROP POLICY IF EXISTS ab_conversions_policy ON ab_test_conversions;
DROP POLICY IF EXISTS ab_usage_policy ON ab_test_usage;
DROP POLICY IF EXISTS ab_variants_policy ON ab_test_variants;

-- Disable Row Level Security
ALTER TABLE ab_test_conversions DISABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_usage DISABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_variants DISABLE ROW LEVEL SECURITY;

-- Drop indexes (idempotent)
DROP INDEX IF EXISTS idx_ab_conversions_variant;
DROP INDEX IF EXISTS idx_ab_usage_case;
DROP INDEX IF EXISTS idx_ab_usage_variant;
DROP INDEX IF EXISTS idx_ab_variants_company;

-- Drop tables in reverse order of creation (due to foreign key dependencies)
-- Drop ab_test_conversions first (references ab_test_variants and recovery_cases)
DROP TABLE IF EXISTS ab_test_conversions;

-- Drop ab_test_usage (references ab_test_variants and recovery_cases)
DROP TABLE IF EXISTS ab_test_usage;

-- Drop ab_test_variants (referenced by other tables)
DROP TABLE IF EXISTS ab_test_variants;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'A/B Testing rollback completed successfully';
    RAISE NOTICE 'Dropped tables: ab_test_conversions, ab_test_usage, ab_test_variants';
    RAISE NOTICE 'Dropped view: ab_test_performance';
    RAISE NOTICE 'Dropped function: get_best_ab_variant(text)';
    RAISE NOTICE 'WARNING: All A/B testing data has been permanently deleted';
END $$;