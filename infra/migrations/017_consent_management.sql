-- Migration: 017_consent_management.sql
-- Consent Management System for GDPR Compliance
-- This migration creates tables for tracking user consent records, consent templates, and audit logs

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Consent templates table for configurable consent types
CREATE TABLE IF NOT EXISTS consent_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  description text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  consent_type text NOT NULL CHECK (consent_type IN ('marketing', 'analytics', 'functional', 'third_party', 'legal')),
  is_active boolean DEFAULT true,
  is_required boolean DEFAULT false,
  expiration_days int, -- NULL means no expiration
  withdrawal_allowed boolean DEFAULT true,
  data_retention_days int, -- How long to retain data after consent withdrawal
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text,
  updated_by text
);

-- User consents table for tracking user consent records
CREATE TABLE IF NOT EXISTS user_consents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id text NOT NULL,
  company_id text NOT NULL,
  template_id uuid REFERENCES consent_templates(id) ON DELETE RESTRICT,
  consent_type text NOT NULL CHECK (consent_type IN ('marketing', 'analytics', 'functional', 'third_party', 'legal')),
  status text NOT NULL CHECK (status IN ('active', 'withdrawn', 'expired')) DEFAULT 'active',
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz, -- NULL means no expiration
  withdrawn_at timestamptz,
  withdrawal_reason text,
  ip_address inet,
  user_agent text,
  consent_data jsonb DEFAULT '{}', -- Additional consent-specific data
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure user can only have one active consent per type per company
  UNIQUE(user_id, company_id, consent_type, status) WHERE (status = 'active')
);

-- Consent audit log table for tracking consent changes
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  consent_id uuid REFERENCES user_consents(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  company_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('granted', 'withdrawn', 'renewed', 'expired', 'updated')),
  previous_status text,
  new_status text,
  reason text,
  ip_address inet,
  user_agent text,
  metadata jsonb DEFAULT '{}', -- Additional audit context
  created_at timestamptz DEFAULT now(),
  created_by text
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_consent_templates_type ON consent_templates(consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_templates_active ON consent_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_user_consents_user_company ON user_consents(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_company_status ON user_consents(company_id, status);
CREATE INDEX IF NOT EXISTS idx_user_consents_type_status ON user_consents(consent_type, status);
CREATE INDEX IF NOT EXISTS idx_user_consents_expires_at ON user_consents(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_consents_granted_at ON user_consents(granted_at);
CREATE INDEX IF NOT EXISTS idx_consent_audit_consent_id ON consent_audit_log(consent_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_user_company ON consent_audit_log(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_consent_audit_action ON consent_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_consent_audit_created_at ON consent_audit_log(created_at);

-- Row Level Security policies
ALTER TABLE consent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policy for consent_templates - read access for all authenticated users
CREATE POLICY "consent_templates_read_policy" ON consent_templates
  FOR SELECT USING (true);

-- RLS policy for consent_templates - write access only for system users
CREATE POLICY "consent_templates_write_policy" ON consent_templates
  FOR ALL USING (
    created_by = current_setting('app.current_user_id', true) OR
    current_setting('app.current_user_role', true) = 'system'
  );

-- RLS policy for user_consents - users can only access their own consents
CREATE POLICY "user_consents_user_policy" ON user_consents
  FOR ALL USING (
    user_id = current_setting('app.current_user_id', true) OR
    current_setting('app.current_user_role', true) = 'system'
  );

-- RLS policy for user_consents - company access for company users
CREATE POLICY "user_consents_company_policy" ON user_consents
  FOR SELECT USING (
    company_id = current_setting('app.current_company_id', true)
  );

-- RLS policy for consent_audit_log - users can only access their own audit logs
CREATE POLICY "consent_audit_user_policy" ON consent_audit_log
  FOR ALL USING (
    user_id = current_setting('app.current_user_id', true) OR
    current_setting('app.current_user_role', true) = 'system'
  );

-- RLS policy for consent_audit_log - company access for company users
CREATE POLICY "consent_audit_company_policy" ON consent_audit_log
  FOR SELECT USING (
    company_id = current_setting('app.current_company_id', true)
  );

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at timestamps
CREATE TRIGGER update_consent_templates_updated_at
  BEFORE UPDATE ON consent_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_consents_updated_at
  BEFORE UPDATE ON user_consents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger function to create audit log entries
CREATE OR REPLACE FUNCTION create_consent_audit_entry()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert audit log entry for status changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO consent_audit_log (
      consent_id,
      user_id,
      company_id,
      action,
      previous_status,
      new_status,
      reason,
      ip_address,
      user_agent,
      metadata,
      created_by
    ) VALUES (
      NEW.id,
      NEW.user_id,
      NEW.company_id,
      CASE 
        WHEN NEW.status = 'withdrawn' THEN 'withdrawn'
        WHEN OLD.status = 'withdrawn' AND NEW.status = 'active' THEN 'renewed'
        WHEN NEW.status = 'expired' THEN 'expired'
        ELSE 'updated'
      END,
      OLD.status,
      NEW.status,
      NEW.withdrawal_reason,
      NEW.ip_address,
      NEW.user_agent,
      jsonb_build_object(
        'template_id', NEW.template_id,
        'consent_type', NEW.consent_type,
        'expires_at', NEW.expires_at
      ),
      current_setting('app.current_user_id', true)
    );
  END IF;

  -- Insert audit log entry for new consents
  IF TG_OP = 'INSERT' THEN
    INSERT INTO consent_audit_log (
      consent_id,
      user_id,
      company_id,
      action,
      previous_status,
      new_status,
      ip_address,
      user_agent,
      metadata,
      created_by
    ) VALUES (
      NEW.id,
      NEW.user_id,
      NEW.company_id,
      'granted',
      NULL,
      NEW.status,
      NEW.ip_address,
      NEW.user_agent,
      jsonb_build_object(
        'template_id', NEW.template_id,
        'consent_type', NEW.consent_type,
        'expires_at', NEW.expires_at
      ),
      current_setting('app.current_user_id', true)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Triggers for audit logging
CREATE TRIGGER consent_audit_trigger
  AFTER INSERT OR UPDATE ON user_consents
  FOR EACH ROW
  EXECUTE FUNCTION create_consent_audit_entry();

-- Function to check for expired consents
CREATE OR REPLACE FUNCTION check_expired_consents()
RETURNS void AS $$
BEGIN
  UPDATE user_consents
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at <= now();
END;
$$ language 'plpgsql';

-- Insert default consent templates
INSERT INTO consent_templates (name, description, consent_type, is_required, expiration_days, data_retention_days, created_by) VALUES
  ('Marketing Communications', 'Consent for marketing communications and promotional content', 'marketing', false, 365, 30, 'system'),
  ('Analytics and Tracking', 'Consent for analytics tracking and usage measurement', 'analytics', false, 730, 90, 'system'),
  ('Functional Services', 'Consent for essential functional services', 'functional', true, NULL, 365, 'system'),
  ('Third Party Sharing', 'Consent for sharing data with third-party services', 'third_party', false, 365, 60, 'system'),
  ('Legal Compliance', 'Consent for legal and regulatory compliance', 'legal', true, NULL, 2555, 'system')
ON CONFLICT (name) DO NOTHING;

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Consent management migration completed successfully';
    RAISE NOTICE 'Created tables: consent_templates, user_consents, consent_audit_log';
    RAISE NOTICE 'Added RLS policies, triggers, indexes, and default consent templates';
END $$;