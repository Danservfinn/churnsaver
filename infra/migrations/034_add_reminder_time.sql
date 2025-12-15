-- Migration: 034_add_reminder_time
-- Description: Add reminder_time column to creator_settings for specifying when daily reminders go out
-- Date: 2025-12-15

-- Add reminder_time column (stored as TIME, defaults to 10:00 AM)
ALTER TABLE creator_settings 
ADD COLUMN IF NOT EXISTS reminder_time TIME DEFAULT '10:00:00';

-- Add comment
COMMENT ON COLUMN creator_settings.reminder_time IS 'Time of day (UTC) when reminder notifications are sent';
