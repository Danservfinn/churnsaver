-- Harden billing/usage RLS and tighten companies policies

-- Protect company_subscriptions with tenant-aware RLS (only own row)
DO $$
BEGIN
  IF to_regclass('company_subscriptions') IS NOT NULL THEN
    ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS company_subscriptions_select_policy ON company_subscriptions;
    DROP POLICY IF EXISTS company_subscriptions_insert_policy ON company_subscriptions;
    DROP POLICY IF EXISTS company_subscriptions_update_policy ON company_subscriptions;

    CREATE POLICY company_subscriptions_select_policy ON company_subscriptions
      FOR SELECT USING (company_id = get_current_company_id());

    CREATE POLICY company_subscriptions_insert_policy ON company_subscriptions
      FOR INSERT WITH CHECK (company_id = get_current_company_id());

    CREATE POLICY company_subscriptions_update_policy ON company_subscriptions
      FOR UPDATE USING (company_id = get_current_company_id());
  ELSE
    RAISE NOTICE 'company_subscriptions table not present; skipping RLS hardening';
  END IF;
END
$$;

-- Tier limits are global configuration; enable RLS but restrict to read-only
DO $$
BEGIN
  IF to_regclass('tier_limits') IS NOT NULL THEN
    ALTER TABLE tier_limits ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS tier_limits_select_policy ON tier_limits;
    CREATE POLICY tier_limits_select_policy ON tier_limits
      FOR SELECT USING (true);
  ELSE
    RAISE NOTICE 'tier_limits table not present; skipping RLS enable';
  END IF;
END
$$;

-- Tighten companies table policies to current tenant only
DO $$
BEGIN
  IF to_regclass('companies') IS NOT NULL THEN
    DROP POLICY IF EXISTS companies_select_policy ON companies;
    DROP POLICY IF EXISTS companies_insert_policy ON companies;

    CREATE POLICY companies_select_policy ON companies
      FOR SELECT USING (id = get_current_company_id());

    CREATE POLICY companies_insert_policy ON companies
      FOR INSERT WITH CHECK (id = get_current_company_id());
  ELSE
    RAISE NOTICE 'companies table not present; skipping policy hardening';
  END IF;
END
$$;

