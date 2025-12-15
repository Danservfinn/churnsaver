-- Migration: 035_add_reminder_timezone
-- Description: Add reminder_timezone column to creator_settings for specifying timezone for reminders
-- Date: 2025-12-15

-- Add reminder_timezone column (stored as TEXT, defaults to UTC)
ALTER TABLE creator_settings 
ADD COLUMN IF NOT EXISTS reminder_timezone TEXT DEFAULT 'America/New_York';

-- Add comment
COMMENT ON COLUMN creator_settings.reminder_timezone IS 'IANA timezone identifier for when reminder notifications are sent (e.g., America/New_York)';
