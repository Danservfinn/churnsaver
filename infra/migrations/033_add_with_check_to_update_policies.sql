-- Add WITH CHECK to UPDATE policies to prevent cross-tenant company_id reassignment
-- This ensures that UPDATE operations cannot change company_id to a different tenant

-- Events table UPDATE policy
DROP POLICY IF EXISTS events_company_update_policy ON events;
CREATE POLICY events_company_update_policy ON events
  FOR UPDATE
  USING (company_id = get_current_company_id())
  WITH CHECK (company_id = get_current_company_id());

-- Recovery cases table UPDATE policy
DROP POLICY IF EXISTS recovery_cases_company_update_policy ON recovery_cases;
CREATE POLICY recovery_cases_company_update_policy ON recovery_cases
  FOR UPDATE
  USING (company_id = get_current_company_id())
  WITH CHECK (company_id = get_current_company_id());

-- Creator settings table UPDATE policy
DROP POLICY IF EXISTS creator_settings_company_update_policy ON creator_settings;
CREATE POLICY creator_settings_company_update_policy ON creator_settings
  FOR UPDATE
  USING (company_id = get_current_company_id())
  WITH CHECK (company_id = get_current_company_id());

-- Add comment explaining the security benefit
COMMENT ON POLICY events_company_update_policy ON events IS 
  'Prevents cross-tenant updates: USING ensures only matching rows can be updated, WITH CHECK prevents company_id reassignment';
COMMENT ON POLICY recovery_cases_company_update_policy ON recovery_cases IS 
  'Prevents cross-tenant updates: USING ensures only matching rows can be updated, WITH CHECK prevents company_id reassignment';
COMMENT ON POLICY creator_settings_company_update_policy ON creator_settings IS 
  'Prevents cross-tenant updates: USING ensures only matching rows can be updated, WITH CHECK prevents company_id reassignment';

