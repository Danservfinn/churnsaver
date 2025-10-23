-- Migration: Add A/B Testing tables for message copy optimization
-- Enables testing different nudge copy variants to optimize CTR
-- Tracks variant usage and performance metrics

-- A/B test variants table
CREATE TABLE IF NOT EXISTS ab_test_variants (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text,
    push_title text,
    push_body text,
    dm_message text,
    weight integer NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
    active boolean NOT NULL DEFAULT false,
    company_id text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- A/B test usage tracking (what was sent to whom)
CREATE TABLE IF NOT EXISTS ab_test_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id text NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
    case_id text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('push', 'dm')),
    company_id text NOT NULL,
    membership_id text NOT NULL,
    sent_at timestamp with time zone NOT NULL DEFAULT now()
);

-- A/B test conversions (clicks and successful recoveries)
CREATE TABLE IF NOT EXISTS ab_test_conversions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id text NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
    case_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('click', 'convert')),
    occurred_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indices for efficient queries
CREATE INDEX IF NOT EXISTS idx_ab_variants_company ON ab_test_variants(company_id, active);
CREATE INDEX IF NOT EXISTS idx_ab_usage_variant ON ab_test_usage(variant_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_ab_usage_case ON ab_test_usage(case_id, channel);
CREATE INDEX IF NOT EXISTS idx_ab_conversions_variant ON ab_test_conversions(variant_id, occurred_at);

-- Add RLS policies for multi-tenant security
ALTER TABLE ab_test_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_conversions ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their company's A/B test data
CREATE POLICY ab_variants_policy ON ab_test_variants
    FOR ALL USING (company_id = current_setting('app.company_id', true)::text);

CREATE POLICY ab_usage_policy ON ab_test_usage
    FOR ALL USING (company_id = current_setting('app.company_id', true)::text);

CREATE POLICY ab_conversions_policy ON ab_test_conversions
    FOR ALL USING (true); -- Conversions are linked to variants which are company-scoped

-- Performance view for variant metrics (calculated on-demand)
CREATE OR REPLACE VIEW ab_test_performance AS
SELECT
    v.id as variant_id,
    v.name as variant_name,
    v.company_id,
    COUNT(DISTINCT u.id) as messages_sent,
    COUNT(DISTINCT CASE WHEN c.event_type = 'click' THEN c.id END) as clicks,
    COUNT(DISTINCT CASE WHEN c.event_type = 'convert' THEN c.id END) as conversions,
    CASE WHEN COUNT(DISTINCT u.id) > 0
         THEN ROUND((COUNT(DISTINCT CASE WHEN c.event_type = 'click' THEN c.id END)::numeric / COUNT(DISTINCT u.id)::numeric) * 100, 2)
         ELSE 0
    END as ctr_percent,
    CASE WHEN COUNT(DISTINCT CASE WHEN c.event_type = 'click' THEN c.id END) > 0
         THEN ROUND((COUNT(DISTINCT CASE WHEN c.event_type = 'convert' THEN c.id END)::numeric / COUNT(DISTINCT CASE WHEN c.event_type = 'click' THEN c.id END)::numeric) * 100, 2)
         ELSE 0
    END as conversion_rate_percent,
    MAX(u.sent_at) as last_sent,
    MAX(c.occurred_at) as last_conversion
FROM ab_test_variants v
LEFT JOIN ab_test_usage u ON v.id = u.variant_id
LEFT JOIN ab_test_conversions c ON v.id = c.variant_id AND u.case_id = c.case_id
WHERE v.active = true
GROUP BY v.id, v.name, v.company_id;

-- Function to get best performing variant for a company
CREATE OR REPLACE FUNCTION get_best_ab_variant(company_id_param text)
RETURNS text AS $$
DECLARE
    best_variant text;
BEGIN
    SELECT variant_id INTO best_variant
    FROM ab_test_performance
    WHERE company_id = company_id_param
    ORDER BY ctr_percent DESC, messages_sent DESC
    LIMIT 1;

    RETURN COALESCE(best_variant, '');
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE ab_test_variants IS 'A/B test variants for message copy optimization';
COMMENT ON TABLE ab_test_usage IS 'Tracking of which variants were sent to which cases';
COMMENT ON TABLE ab_test_conversions IS 'Tracking of click and conversion events by variant';
COMMENT ON VIEW ab_test_performance IS 'Aggregated performance metrics for A/B test variants';
COMMENT ON FUNCTION get_best_ab_variant(text) IS 'Returns the ID of the best performing variant for a company';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'A/B Testing migration completed successfully';
    RAISE NOTICE 'Created tables: ab_test_variants, ab_test_usage, ab_test_conversions';
    RAISE NOTICE 'Created view: ab_test_performance';
    RAISE NOTICE 'A/B testing supports push and DM message variants with click tracking';
END $$;
