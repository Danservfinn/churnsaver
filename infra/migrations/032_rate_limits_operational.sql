-- Treat rate_limits as an operational/global table (not tenant data)
-- Removes tenant-scoped company_id and RLS policy that depended on it.

-- Drop RLS policy and disable RLS (operational data)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'rate_limits_company_policy' AND tablename = 'rate_limits'
  ) THEN
    EXECUTE 'DROP POLICY rate_limits_company_policy ON rate_limits';
  END IF;
END;
$$;

ALTER TABLE IF EXISTS rate_limits DISABLE ROW LEVEL SECURITY;

-- Drop company_id column if present (was added for tenant scoping)
DO $$
BEGIN
  IF to_regclass('rate_limits') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'rate_limits' AND column_name = 'company_id'
    ) THEN
      ALTER TABLE rate_limits DROP COLUMN company_id;
    END IF;
  END IF;
END;
$$;

-- Ensure composite primary key still exists on (company_key, window_bucket_start)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rate_limits_pkey'
      AND conrelid = 'rate_limits'::regclass
  ) THEN
    ALTER TABLE rate_limits
      ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (company_key, window_bucket_start);
  END IF;
END;
$$;

