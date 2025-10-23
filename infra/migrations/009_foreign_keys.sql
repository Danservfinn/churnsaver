-- Migration: 009_foreign_keys.sql
-- Add foreign keys for A/B testing tables to ensure data integrity

-- Add foreign key from ab_test_usage to recovery_cases
-- This ensures that usage records only exist for valid case IDs
ALTER TABLE ab_test_usage
ADD CONSTRAINT fk_ab_test_usage_case_id
FOREIGN KEY (case_id) REFERENCES recovery_cases(id) ON DELETE CASCADE;

-- Add foreign key from ab_test_conversions to recovery_cases
-- This ensures that conversion records only exist for valid case IDs
ALTER TABLE ab_test_conversions
ADD CONSTRAINT fk_ab_test_conversions_case_id
FOREIGN KEY (case_id) REFERENCES recovery_cases(id) ON DELETE CASCADE;

-- Note: Foreign keys to ab_test_variants are already defined in the A/B testing migration
-- via REFERENCES ab_test_variants(id) ON DELETE CASCADE in the table creation

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Foreign keys migration completed successfully';
    RAISE NOTICE 'Added foreign keys: fk_ab_test_usage_case_id, fk_ab_test_conversions_case_id';
END $$;