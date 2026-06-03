/*
  # Add Proposal Visibility Setting

  1. Changes
    - Add `can_see_all_proposals` boolean to profiles table
    - Defaults to true for backward compatibility
    - Admins can control whether sales reps see only their proposals or all proposals
  
  2. Security
    - Only admins can modify this setting
    - Sales reps can read their own setting
*/

-- Add column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS can_see_all_proposals boolean DEFAULT true;

-- Add comment explaining the column
COMMENT ON COLUMN profiles.can_see_all_proposals IS 
  'If true, user can see all proposals. If false, user only sees proposals they created. Controlled by admin.';

-- Update existing users to true by default (backward compatible)
UPDATE profiles 
SET can_see_all_proposals = true 
WHERE can_see_all_proposals IS NULL;
