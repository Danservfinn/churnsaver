-- Churn Saver Database Schema Rollback
-- Rollback: 009_rollback.sql
-- Reverses migration: 009_foreign_keys.sql

-- Drop foreign key constraints from A/B testing tables
-- These constraints ensure data integrity but can be safely removed if needed

-- Drop foreign key from ab_test_usage to recovery_cases
ALTER TABLE ab_test_usage DROP CONSTRAINT IF EXISTS fk_ab_test_usage_case_id;

-- Drop foreign key from ab_test_conversions to recovery_cases
ALTER TABLE ab_test_conversions DROP CONSTRAINT IF EXISTS fk_ab_test_conversions_case_id;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Foreign keys rollback completed successfully';
    RAISE NOTICE 'Dropped foreign keys: fk_ab_test_usage_case_id, fk_ab_test_conversions_case_id';
    RAISE NOTICE 'WARNING: Data integrity constraints between A/B testing and recovery cases have been removed';
END $$;