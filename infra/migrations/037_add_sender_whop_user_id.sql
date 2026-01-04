-- Migration 037: Add sender_whop_user_id to creator_settings
-- Allows merchants to configure their Whop user ID so notifications appear from them

ALTER TABLE creator_settings
ADD COLUMN IF NOT EXISTS sender_whop_user_id TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN creator_settings.sender_whop_user_id IS
  'Optional Whop user ID for the merchant. When set, notifications will appear to come from this user instead of the ChurnSaver app.';
