/*
  # Add Notification Preferences to Profiles

  ## Changes
  1. Adds notification preference columns to profiles table:
    - `notify_on_mention` (boolean) - Receive notifications when mentioned in discussions (default: true)
    - `notify_on_lead_assigned` (boolean) - Receive notifications when leads are assigned (default: true)
    - `notify_on_fishbowl` (boolean) - Receive notifications for new fishbowl leads (default: true)
    - `notify_on_escalated` (boolean) - Receive notifications when leads are escalated (default: true)

  ## Purpose
  - Allows users to control which notifications they receive
  - Provides granular control over different notification types
  - All notification preferences default to true (opt-out model)
  
  ## Security
  - No RLS changes needed - existing policies cover profile updates
  - Users can update their own notification preferences
*/

-- Add notification preference columns to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'notify_on_mention'
  ) THEN
    ALTER TABLE profiles ADD COLUMN notify_on_mention boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'notify_on_lead_assigned'
  ) THEN
    ALTER TABLE profiles ADD COLUMN notify_on_lead_assigned boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'notify_on_fishbowl'
  ) THEN
    ALTER TABLE profiles ADD COLUMN notify_on_fishbowl boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'notify_on_escalated'
  ) THEN
    ALTER TABLE profiles ADD COLUMN notify_on_escalated boolean DEFAULT true;
  END IF;
END $$;

-- Update existing users to have all notifications enabled by default
UPDATE profiles
SET 
  notify_on_mention = COALESCE(notify_on_mention, true),
  notify_on_lead_assigned = COALESCE(notify_on_lead_assigned, true),
  notify_on_fishbowl = COALESCE(notify_on_fishbowl, true),
  notify_on_escalated = COALESCE(notify_on_escalated, true)
WHERE 
  notify_on_mention IS NULL 
  OR notify_on_lead_assigned IS NULL 
  OR notify_on_fishbowl IS NULL 
  OR notify_on_escalated IS NULL;