/*
  # Add Lead Status Update Notification Preference

  ## Changes
  1. Adds notification preference for lead status updates to profiles table:
    - `notify_on_lead_status` (boolean) - Receive notifications when your priority leads are updated (default: true)

  ## Purpose
  - Allows lead creators to receive updates when their high/urgent priority leads are claimed or status changes
  - Enables accountability and tracking for important leads
  - Defaults to true (opt-out model)
  
  ## Security
  - No RLS changes needed - existing policies cover profile updates
  - Users can update their own notification preferences
*/

-- Add lead status notification preference to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'notify_on_lead_status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN notify_on_lead_status boolean DEFAULT true;
  END IF;
END $$;

-- Update existing users to have notification enabled by default
UPDATE profiles
SET notify_on_lead_status = COALESCE(notify_on_lead_status, true)
WHERE notify_on_lead_status IS NULL;