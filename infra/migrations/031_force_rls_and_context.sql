-- Enforce tenant isolation and make company context transaction-local
-- - Replaces set_company_context to use transaction-local config
-- - Forces RLS on core tenant tables
-- - Tightens events insert policy to require company match

-- Set company context as LOCAL (transaction-scoped) to avoid pool leakage
CREATE OR REPLACE FUNCTION set_company_context(company_id_param text)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_company_id', company_id_param, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Force RLS on tenant tables (guards even when connecting with elevated roles)
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'events',
    'recovery_cases',
    'recovery_actions',
    'recovery_link_sends',
    'recovery_click_events',
    'creator_settings',
    'company_subscriptions',
    'tier_limits',
    'ab_tests',
    'ab_test_variants',
    'ab_test_participants'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE IF EXISTS %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END$$;

-- Tighten events insert policy (require company match rather than open insert)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE polname = 'events_webhook_insert_policy' AND tablename = 'events'
  ) THEN
    EXECUTE 'DROP POLICY events_webhook_insert_policy ON events';
  END IF;

  EXECUTE '
    CREATE POLICY events_webhook_insert_policy ON events
    FOR INSERT
    WITH CHECK (company_id = get_current_company_id())
  ';
END;
$$;

