/*
  # Optimize Bug Reports Performance

  1. Indexes
    - Add composite index for efficient filtering and sorting
    - Add index on user_id for join performance
    - Add index on is_fixed for filtering

  2. Performance Notes
    - These indexes will dramatically speed up queries that filter by is_fixed
    - The composite index helps with pagination queries
    - Foreign key index speeds up profile joins
*/

-- Add index on is_fixed for filtering
CREATE INDEX IF NOT EXISTS idx_bug_reports_is_fixed 
  ON bug_reports(is_fixed);

-- Add composite index for sorting and pagination
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at_is_fixed 
  ON bug_reports(created_at DESC, is_fixed);

-- Add index on user_id for profile joins (if not exists)
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id 
  ON bug_reports(user_id);

-- Add index on bug_notification_settings for faster lookups
CREATE INDEX IF NOT EXISTS idx_bug_notification_settings_user_id 
  ON bug_notification_settings(user_id);
