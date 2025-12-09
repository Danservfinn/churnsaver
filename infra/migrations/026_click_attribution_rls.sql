-- Enable RLS on click attribution tables and align with tenant isolation
ALTER TABLE recovery_link_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_click_events ENABLE ROW LEVEL SECURITY;

-- recovery_link_sends policies
CREATE POLICY recovery_link_sends_select_policy ON recovery_link_sends
  FOR SELECT USING (company_id = get_current_company_id());

CREATE POLICY recovery_link_sends_insert_policy ON recovery_link_sends
  FOR INSERT WITH CHECK (company_id = get_current_company_id());

CREATE POLICY recovery_link_sends_update_policy ON recovery_link_sends
  FOR UPDATE USING (company_id = get_current_company_id());

CREATE POLICY recovery_link_sends_delete_policy ON recovery_link_sends
  FOR DELETE USING (company_id = get_current_company_id());

-- recovery_click_events policies
CREATE POLICY recovery_click_events_select_policy ON recovery_click_events
  FOR SELECT USING (company_id = get_current_company_id());

CREATE POLICY recovery_click_events_insert_policy ON recovery_click_events
  FOR INSERT WITH CHECK (company_id = get_current_company_id());

CREATE POLICY recovery_click_events_update_policy ON recovery_click_events
  FOR UPDATE USING (company_id = get_current_company_id());

CREATE POLICY recovery_click_events_delete_policy ON recovery_click_events
  FOR DELETE USING (company_id = get_current_company_id());

